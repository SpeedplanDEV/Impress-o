/**
 * Teste ponta a ponta do Impress-o em navegador real (Chromium via Playwright).
 * Sobe o servidor em modo produção com pasta de dados temporária, percorre:
 * configuração inicial → empresa+logo → modelo pronto → pessoa com foto → editor → impressão simulada → custo.
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'

const REPO = process.cwd()
const PORT = 3099
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'impresso-e2e-'))
const shots = path.join(REPO, 'e2e', 'shots')
fs.mkdirSync(shots, { recursive: true })

function png(width, height, rgb = [200, 80, 80]) {
  const crcTable = []
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0 }
  const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2
  const raw = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y++) { raw[y * (width * 3 + 1)] = 0; for (let x = 0; x < width; x++) { const i = y * (width * 3 + 1) + 1 + x * 3; const shade = (x + y) % 40 < 20 ? 1 : 0.7; raw[i] = rgb[0] * shade; raw[i + 1] = rgb[1] * shade; raw[i + 2] = rgb[2] * shade } }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
const photoFile = path.join(dataDir, 'foto.png'); fs.writeFileSync(photoFile, png(300, 400, [90, 140, 200]))
const logoFile = path.join(dataDir, 'logo.png'); fs.writeFileSync(logoFile, png(400, 120, [30, 120, 60]))

const server = spawn('node', ['--disable-warning=ExperimentalWarning', 'dist/server/src/index.js'], { cwd: REPO, env: { ...process.env, PORT: String(PORT), IMPRESSO_DATA_DIR: dataDir }, stdio: ['ignore', 'pipe', 'pipe'] })
let serverLog = ''
server.stdout.on('data', (d) => { serverLog += d })
server.stderr.on('data', (d) => { serverLog += d })
// Espera o servidor responder (o banco em memória Postgres demora alguns segundos para iniciar)
async function esperarServidor(url, tentativas = 60) {
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(url)
      if (r.ok) return
    } catch {
      /* ainda subindo */
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`Servidor não respondeu em ${url}`)
}
await esperarServidor(`http://127.0.0.1:${PORT}/api/auth/status`)

const results = []
const ok = (name, cond, extra = '') => { results.push({ name, ok: !!cond, extra }); console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`) }

let browser
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true })
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`) })

  await page.goto(`http://127.0.0.1:${PORT}/`)
  await page.waitForSelector('text=Configuração inicial', { timeout: 15000 })
  await page.fill('input[required]:not([type=password])', 'Ana Operadora')
  const pws = await page.$$('input[type=password]')
  await pws[0].fill('senha123'); await pws[1].fill('senha123')
  await page.click('button:has-text("Concluir configuração")')
  await page.waitForSelector('text=Primeiros passos', { timeout: 15000 })
  ok('setup inicial e login automático', true)
  await page.screenshot({ path: path.join(shots, '01-home.png') })

  // Empresa com logo
  await page.click('nav >> text=Empresas e departamentos')
  await page.click('button:has-text("+ Nova empresa")')
  await page.fill('.modal input[required]', 'ACME Tecnologia Ltda')
  await page.setInputFiles('.modal input[type=file]', logoFile)
  await page.waitForSelector('.modal img.thumb')
  await page.click('.modal button:has-text("Salvar")')
  await page.waitForSelector('td:has-text("ACME Tecnologia Ltda")')
  ok('empresa criada com logo', true)
  await page.click('td:has-text("ACME Tecnologia Ltda")')
  await page.click('button:has-text("+ Novo departamento")')
  await page.fill('.modal input[required]', 'Engenharia')
  await page.click('.modal button:has-text("Salvar")')
  await page.waitForSelector('.badge:has-text("Engenharia")')
  ok('departamento criado', true)
  await page.screenshot({ path: path.join(shots, '02-empresas.png') })

  // Modelo pronto -> editor
  await page.click('nav >> text=Modelos de cartão')
  await page.waitForSelector('text=Modelos prontos')
  await page.click('button:has-text("Usar este modelo") >> nth=0')
  await page.waitForSelector('.editor-stage canvas', { timeout: 15000 })
  await page.waitForTimeout(800)
  const layers = await page.$$eval('.layers .layer', (els) => els.length)
  ok('editor abriu o modelo pronto com camadas', layers >= 8, `${layers} camadas`)
  // Adiciona um texto e verifica a camada
  await page.click('button:has-text("+ Texto")')
  await page.waitForTimeout(300)
  const layers2 = await page.$$eval('.layers .layer', (els) => els.length)
  ok('adicionar elemento no editor', layers2 === layers + 1)
  // Painel de propriedades do elemento selecionado
  ok('painel de propriedades aparece', await page.isVisible('text=Elemento selecionado'))
  // Pré-visualização com dados de exemplo
  await page.check('text=Pré-visualizar com dados de exemplo >> input')
  await page.waitForTimeout(800)
  await page.screenshot({ path: path.join(shots, '03-editor-preview.png') })
  await page.uncheck('text=Pré-visualizar com dados de exemplo >> input')
  await page.waitForTimeout(400)
  // Salva o modelo (gera miniatura)
  await page.click('button:has-text("Salvar modelo")')
  await page.waitForSelector('text=Modelo salvo.', { timeout: 15000 })
  ok('modelo salvo com miniatura', true)
  await page.screenshot({ path: path.join(shots, '04-editor.png') })
  // Exporta JSON e reimporta
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Exportar .json")')])
  const exported = await dl.path()
  const exportedJson = JSON.parse(fs.readFileSync(exported, 'utf8'))
  ok('exportação .json do modelo', exportedJson.format === 'impress-o/template' && exportedJson.front?.fabric?.objects?.length > 5)
  await page.click('a:has-text("← Modelos")')
  await page.waitForSelector('.template-card', { timeout: 15000 })
  await page.waitForSelector('.template-card img', { timeout: 15000 }).catch(() => null)
  const thumbCount = await page.$$eval('.template-card img', (els) => els.length)
  ok('miniatura do modelo na listagem', thumbCount >= 1)
  await page.click('button:has-text("Importar modelo (.json)")')
  await page.setInputFiles('.modal input[type=file]', exported)
  await page.fill('.modal label:has-text("Nome") input', 'Modelo importado')
  await page.click('.modal button:has-text("Importar")')
  await page.waitForSelector('.editor-stage canvas', { timeout: 15000 })
  ok('importação de modelo', true)
  // Vincula o modelo importado ao departamento como padrão
  await page.click('a:has-text("← Modelos")')
  await page.waitForSelector('.template-card:has-text("Modelo importado")', { timeout: 15000 })
  await page.click('.template-card:has-text("Modelo importado") button:has-text("Vincular")')
  await page.selectOption('.modal label:has-text("Empresa") select', { label: 'ACME Tecnologia Ltda' })
  await page.waitForTimeout(400)
  await page.selectOption('.modal label:has-text("Departamento") select', { label: 'Engenharia' })
  await page.click('.modal button:has-text("Salvar")')
  await page.waitForTimeout(500)
  ok('vínculo de modelo ao departamento', await page.isVisible('.template-card:has-text("Modelo importado"):has-text("Engenharia")'))
  await page.screenshot({ path: path.join(shots, '05-modelos.png') })

  // Pessoa com foto 3x4 (upload + recorte)
  await page.click('nav >> text=Pessoas')
  await page.click('button:has-text("+ Nova pessoa")')
  await page.fill('.modal label:has-text("Nome completo") input', 'Carlos Eduardo Pereira')
  await page.fill('.modal label:has-text("Cargo") input', 'Engenheiro de Software')
  await page.fill('.modal label:has-text("Matrícula") input', '2024001')
  await page.selectOption('.modal label:has-text("Empresa") select', { label: 'ACME Tecnologia Ltda' })
  await page.waitForTimeout(400)
  await page.selectOption('.modal label:has-text("Departamento") select', { label: 'Engenharia' })
  await page.click('.modal button:has-text("Adicionar foto 3x4")')
  await page.waitForSelector('text=Escolher arquivo…')
  await page.setInputFiles('.modal-backdrop:last-of-type input[type=file]', photoFile)
  await page.waitForSelector('.cropper-area', { timeout: 10000 })
  await page.waitForTimeout(600)
  await page.click('button:has-text("Usar esta foto")')
  await page.waitForSelector('img[alt="Foto 3x4"]')
  ok('recorte de foto 3x4', true)
  await page.screenshot({ path: path.join(shots, '06-pessoa.png') })
  await page.click('.modal button[type=submit]:has-text("Salvar")')
  await page.waitForSelector('td:has-text("Carlos Eduardo Pereira")')
  ok('pessoa cadastrada com foto', await page.isVisible('img.photo-3x4'))

  // Conectar impressora direto na tela de impressão
  await page.click('nav >> text=Impressão')
  await page.waitForSelector('text=1. Escolha as pessoas')
  ok('aviso de nenhuma impressora conectada', await page.isVisible('text=Nenhuma impressora conectada neste computador'))
  await page.screenshot({ path: path.join(shots, '06a-sem-impressora.png') })
  await page.click('button:has-text("Conectar Sigma DS")')
  await page.waitForSelector('.modal')
  ok('formulário de conexão lista as filas do sistema', await page.isVisible('.modal label:has-text("Fila de impressão no sistema")'))
  // Sem driver neste ambiente: usa a impressora simulada pelo mesmo formulário
  await page.selectOption('.modal label:has-text("Tipo") select', 'mock')
  await page.fill('.modal label:has-text("Nome de exibição") input', 'Simulada')
  await page.click('.modal button:has-text("Salvar")')
  await page.waitForSelector('.badge:has-text("conectada")', { timeout: 15000 })
  ok('impressora conectada e verificada na tela de impressão', true)
  await page.screenshot({ path: path.join(shots, '06b-conectar-impressora.png') })

  // Cartão de teste nas configurações
  await page.click('nav >> text=Configurações')
  await page.waitForSelector('span.badge:has-text("padrão")')
  await page.click('button:has-text("Cartão de teste")')
  await page.waitForSelector('text=Simulação:', { timeout: 10000 })
  ok('cartão de teste enviado', true)

  // Impressão
  await page.click('nav >> text=Impressão')
  await page.waitForSelector('text=1. Escolha as pessoas')
  await page.click('tr:has-text("Carlos Eduardo Pereira") input[type=checkbox]')
  await page.click('button:has-text("Gerar pré-visualização")')
  await page.waitForSelector('img.card-preview', { timeout: 20000 })
  const previewSrc = await page.$eval('img.card-preview', (i) => i.getAttribute('src'))
  const dims = await page.evaluate((src) => new Promise((r) => { const im = new Image(); im.onload = () => r([im.naturalWidth, im.naturalHeight]); im.src = src }), previewSrc)
  ok('pré-visualização renderizada em 1013×638', dims[0] === 1013 && dims[1] === 638, `${dims[0]}×${dims[1]}`)
  ok('modelo do departamento foi resolvido automaticamente', await page.isVisible('.card-preview + * , .card .row.between span.small:has-text("Modelo importado"), span.small.muted:has-text("Modelo importado")'))
  ok('estimativa de custo exibida', await page.isVisible('text=Custo estimado'))
  await page.screenshot({ path: path.join(shots, '07-impressao.png') })
  await page.click('button:has-text("Imprimir 1 cartão")')
  await page.waitForSelector('.alert.success', { timeout: 20000 })
  await page.waitForSelector('text=enviado(s) à impressora')
  ok('impressão simulada concluída', true)
  await page.waitForSelector('table >> text=Concluído')
  const jobDirs = fs.readdirSync(path.join(dataDir, 'print-output'))
  const jobPng = jobDirs.map((d) => path.join(dataDir, 'print-output', d, 'frente.png')).filter((f) => fs.existsSync(f))
  ok('PNG gravado pela impressora simulada', jobPng.length >= 2, `${jobPng.length} arquivos`)
  // Verifica dimensão do PNG gravado
  const buf = fs.readFileSync(jobPng[jobPng.length - 1])
  ok('PNG gravado tem 1013×638', buf.readUInt32BE(16) === 1013 && buf.readUInt32BE(20) === 638)
  fs.copyFileSync(jobPng[jobPng.length - 1], path.join(shots, 'cartao-impresso.png'))
  // PDF
  const [pdfDl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Baixar PDF")')])
  const pdfBuf = fs.readFileSync(await pdfDl.path())
  ok('download de PDF do cartão', pdfBuf.subarray(0, 4).toString() === '%PDF')

  // Custo
  await page.click('nav >> text=Custo de impressão')
  await page.waitForSelector('text=Calculadora')
  await page.fill('label:has-text("Quantidade") input', '250')
  await page.waitForTimeout(300)
  ok('página de custo com resumo das impressões', await page.isVisible('text=Impressões realizadas'))
  await page.click('button:has-text("Salvar parâmetros")')
  await page.waitForSelector('text=Parâmetros de custo salvos')
  await page.screenshot({ path: path.join(shots, '08-custo.png') })

  // Logout / login
  await page.click('button:has-text("Sair")')
  await page.waitForSelector('text=Informe sua senha')
  await page.fill('input[type=password]', 'senha123')
  await page.click('button:has-text("Entrar")')
  await page.waitForSelector('nav >> text=Início')
  ok('logout e login', true)

  ok('sem erros de JavaScript no navegador', errors.length === 0, errors.slice(0, 5).join(' | '))
} catch (err) {
  console.error('E2E ERROR:', err)
  results.push({ name: 'exceção', ok: false, extra: String(err) })
} finally {
  await browser?.close()
  server.kill()
}
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passos OK`)
if (failed.length) { console.log('SERVER LOG:\n' + serverLog.slice(-3000)); process.exit(1) }
