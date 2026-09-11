import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Server } from 'node:http'

// Diretório de dados isolado para os testes (definido antes de importar a config)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'impresso-test-'))
process.env.IMPRESSO_DATA_DIR = tmp

const { createApp } = await import('../src/app.js')
const { closeDb } = await import('../src/lib/db.js')

let server: Server
let base = ''
let cookie = ''

async function call(method: string, url: string, body?: unknown, opts: { raw?: boolean } = {}) {
  const res = await fetch(base + url, {
    method,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  })
  const setCookie = res.headers.get('set-cookie')
  if (setCookie) cookie = setCookie.split(';')[0]
  if (opts.raw) return { status: res.status, buffer: Buffer.from(await res.arrayBuffer()), headers: res.headers }
  const text = await res.text()
  return { status: res.status, data: text ? JSON.parse(text) : null, headers: res.headers }
}

// PNG 1013x638 mínimo (gerado sem dependências): cabeçalho válido com IHDR correto.
function makePng(width: number, height: number): string {
  const zlib = require('node:zlib') as typeof import('node:zlib')
  const crcTable: number[] = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crcTable[n] = c >>> 0
  }
  const crc32 = (buf: Buffer) => {
    let c = 0xffffffff
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(td))
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // RGB
  const raw = Buffer.alloc((width * 3 + 1) * height, 0xff)
  for (let y = 0; y < height; y++) raw[y * (width * 3 + 1)] = 0
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
  return `data:image/png;base64,${png.toString('base64')}`
}

beforeAll(async () => {
  const app = createApp()
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve())
  })
  const addr = server.address() as { port: number }
  base = `http://127.0.0.1:${addr.port}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  closeDb()
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('autenticação de usuário único', () => {
  it('começa sem configuração e bloqueia a API', async () => {
    const s = await call('GET', '/api/auth/status')
    expect(s.data).toEqual({ setupDone: false, authenticated: false, userName: null })
    const blocked = await call('GET', '/api/companies')
    expect(blocked.status).toBe(401)
  })
  it('rejeita senha curta e cria o usuário', async () => {
    const bad = await call('POST', '/api/auth/setup', { name: 'Ana', password: '123' })
    expect(bad.status).toBe(400)
    const ok = await call('POST', '/api/auth/setup', { name: 'Ana', password: 'segredo123' })
    expect(ok.status).toBe(201)
    expect(cookie).toContain('impresso_session=')
    const again = await call('POST', '/api/auth/setup', { name: 'Outro', password: 'segredo123' })
    expect(again.status).toBe(409)
  })
  it('logout, login com senha errada e certa', async () => {
    await call('POST', '/api/auth/logout')
    cookie = ''
    expect((await call('GET', '/api/companies')).status).toBe(401)
    expect((await call('POST', '/api/auth/login', { password: 'errada' })).status).toBe(401)
    const ok = await call('POST', '/api/auth/login', { password: 'segredo123' })
    expect(ok.status).toBe(200)
    expect(ok.data.userName).toBe('Ana')
    expect((await call('GET', '/api/ping')).status).toBe(200)
  })
})

describe('empresas, departamentos e pessoas', () => {
  let companyId = 0
  let departmentId = 0
  let personId = 0
  it('cria empresa com logo', async () => {
    const logo = makePng(4, 4)
    const r = await call('POST', '/api/companies', { name: 'ACME Ltda', cnpj: '00.000.000/0001-00', logoDataUrl: logo })
    expect(r.status).toBe(201)
    companyId = r.data.id
    expect(r.data.logoUrl).toMatch(/^\/api\/assets\/\d+$/)
    const img = await call('GET', r.data.logoUrl, undefined, { raw: true })
    expect(img.status).toBe(200)
    expect(img.headers.get('content-type')).toContain('image/png')
  })
  it('cria departamento e impede duplicado', async () => {
    const r = await call('POST', '/api/departments', { companyId, name: 'TI' })
    expect(r.status).toBe(201)
    departmentId = r.data.id
    expect((await call('POST', '/api/departments', { companyId, name: 'ti' })).status).toBe(409)
  })
  it('cria pessoa com foto e busca', async () => {
    const r = await call('POST', '/api/persons', { fullName: 'João da Silva', departmentId, roleTitle: 'Analista', photoDataUrl: makePng(3, 4) })
    expect(r.status).toBe(201)
    personId = r.data.id
    expect(r.data.companyId).toBe(companyId)
    expect(r.data.departmentName).toBe('TI')
    const list = await call('GET', '/api/persons?q=jo%C3%A3o')
    expect(list.data).toHaveLength(1)
    const data = await call('GET', `/api/cards/data/${personId}`)
    expect(data.data.fields.full_name).toBe('João da Silva')
    expect(data.data.fields.department).toBe('TI')
    expect(data.data.fields.company).toBe('ACME Ltda')
    expect(data.data.photoUrl).toMatch(/^data:image\/png;base64,/)
    expect(data.data.logoUrl).toMatch(/^data:image\/png;base64,/)
  })
  it('importa CSV com ponto e vírgula e cria departamentos', async () => {
    const csv = 'Nome;Cargo;Departamento;Matrícula;Validade\nMaria Souza;Gerente;Financeiro;100;31/12/2027\nPedro Lima;Auxiliar;TI;101;\n'
    const r = await call('POST', '/api/persons/import', { csv, companyId, createDepartments: true })
    expect(r.status).toBe(200)
    expect(r.data.imported).toBe(2)
    expect(r.data.createdDepartments).toBe(1)
    const maria = (await call('GET', '/api/persons?q=Maria')).data[0]
    expect(maria.departmentName).toBe('Financeiro')
    expect(maria.validUntil).toBe('2027-12-31')
  })
  it('rejeita departamento de outra empresa', async () => {
    const other = await call('POST', '/api/companies', { name: 'Outra' })
    const r = await call('PUT', `/api/persons/${personId}`, { companyId: other.data.id, departmentId })
    expect(r.status).toBe(400)
  })
})

describe('modelos', () => {
  let templateId = 0
  it('lista e instala modelos embutidos', async () => {
    const list = await call('GET', '/api/templates/builtin')
    expect(list.data.length).toBeGreaterThanOrEqual(3)
    const r = await call('POST', `/api/templates/builtin/${list.data[0].key}`)
    expect(r.status).toBe(201)
    templateId = r.data.id
    expect(r.data.design.width).toBe(1013)
    expect(r.data.design.front.fabric.objects.some((o: { role?: string }) => o.role === 'photo')).toBe(true)
  })
  it('exporta e reimporta', async () => {
    const exp = await call('GET', `/api/templates/${templateId}/export`)
    expect(exp.status).toBe(200)
    expect(exp.headers.get('content-disposition')).toContain('.impresso.json')
    const imp = await call('POST', '/api/templates/import', { design: exp.data, name: 'Importado' })
    expect(imp.status).toBe(201)
    expect(imp.data.source).toBe('import')
    expect(imp.data.name).toBe('Importado')
    const bad = await call('POST', '/api/templates/import', { design: { foo: 1 } })
    expect(bad.status).toBe(400)
  })
  it('resolve o modelo da pessoa pelo departamento', async () => {
    const persons = (await call('GET', '/api/persons?q=Pedro')).data
    const pedro = persons[0]
    const t2 = await call('POST', '/api/templates', { name: 'Modelo TI', departmentId: pedro.departmentId })
    expect(t2.status).toBe(201)
    await call('PUT', `/api/departments/${pedro.departmentId}`, { defaultTemplateId: t2.data.id })
    const resolved = await call('GET', `/api/templates/resolve/${pedro.id}`)
    expect(resolved.data.id).toBe(t2.data.id)
  })
})

describe('custo e impressão', () => {
  it('calcula custo com parâmetros salvos', async () => {
    const put = await call('PUT', '/api/cost/params', { params: { cardUnitPrice: 1, ribbon: { name: 'X', price: 500, yieldImages: 500, yieldMode: 'per_side' }, laborCostPerHour: 0, minutesPerCard: 0, printerPrice: 0, printheadPrice: 0, cleaningKitPrice: 0, energyPricePerKwh: 0, wasteRatePercent: 0, overheadPercent: 0, marginPercent: 0, taxPercent: 0 } })
    expect(put.status).toBe(200)
    const calc = await call('POST', '/api/cost/calculate', { sides: 2, quantity: 10 })
    expect(calc.data.breakdown.unitCost).toBeCloseTo(3)
    expect(calc.data.breakdown.totalCost).toBeCloseTo(30)
  })
  it('imprime na impressora simulada e registra o custo', async () => {
    const p = await call('POST', '/api/printers', { name: 'Simulada', adapter: 'mock' })
    expect(p.status).toBe(201)
    expect(p.data.isDefault).toBe(true)
    const st = await call('POST', `/api/printers/${p.data.id}/status`)
    expect(st.data.state).toBe('ready')
    const wrong = await call('POST', '/api/print/jobs', { frontPng: makePng(100, 100), copies: 1 })
    expect(wrong.status).toBe(400)
    const job = await call('POST', '/api/print/jobs', { frontPng: makePng(1013, 638), copies: 2, personName: 'Teste' })
    expect(job.status).toBe(201)
    expect(job.data.job.status).toBe('done')
    expect(job.data.job.totalCost).toBeCloseTo(4)
    const out = await call('GET', `/api/print/jobs/${job.data.job.id}/output/frente`, undefined, { raw: true })
    expect(out.status).toBe(200)
    const summary = await call('GET', '/api/cost/summary')
    expect(summary.data.totals.cards).toBe(2)
    const pdf = await call('POST', '/api/print/pdf', { frontPng: makePng(1013, 638), backPng: makePng(1013, 638) }, { raw: true })
    expect(pdf.status).toBe(200)
    expect(pdf.buffer.subarray(0, 4).toString()).toBe('%PDF')
  })
  it('impressora do sistema sem fila é rejeitada', async () => {
    const r = await call('POST', '/api/printers', { name: 'Sigma', adapter: 'system' })
    expect(r.status).toBe(400)
  })
})
