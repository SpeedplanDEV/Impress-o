/**
 * Teste do Impress-o em viewport de celular (Chromium emulando um telefone, com toque).
 * Cobre: menu em gaveta, cadastro de pessoa com foto no formulário em tela cheia,
 * modelo pronto no editor (ajustar à tela), impressão simulada e página de configurações.
 */
import { chromium, devices } from 'playwright'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'

const REPO = process.cwd()
const PORT = 3095
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'impresso-mobile-'))
const shots = path.join(REPO, 'e2e', 'shots-mobile')
fs.mkdirSync(shots, { recursive: true })

function png(width, height, rgb = [200, 80, 80]) {
  const crcTable = []
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0 }
  const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2
  const raw = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y++) { raw[y * (width * 3 + 1)] = 0; for (let x = 0; x < width; x++) { const i = y * (width * 3 + 1) + 1 + x * 3; raw[i] = rgb[0]; raw[i + 1] = rgb[1]; raw[i + 2] = rgb[2] } }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
const photoFile = path.join(dataDir, 'foto.png'); fs.writeFileSync(photoFile, png(300, 400, [90, 140, 200]))

const server = spawn('node', ['--disable-warning=ExperimentalWarning', 'dist/server/src/index.js'], { cwd: REPO, env: { ...process.env, PORT: String(PORT), HOST: '0.0.0.0', IMPRESSO_DATA_DIR: dataDir }, stdio: 'ignore' })
async function esperarServidor(url, tentativas = 60) {
  for (let i = 0; i < tentativas; i++) {
    try { const r = await fetch(url); if (r.ok) return } catch { /* subindo */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`Servidor não respondeu em ${url}`)
}
await esperarServidor(`http://127.0.0.1:${PORT}/api/auth/status`)

const results = []
const ok = (name, cond, extra = '') => { results.push({ name, ok: !!cond }); console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`) }

let browser
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined })
  const phone = devices['Pixel 7']
  const context = await browser.newContext({ ...phone, locale: 'pt-BR' })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

  await page.goto(`http://localhost:${PORT}/`)
  await page.waitForSelector('text=Configuração inicial')
  await page.fill('input[required]:not([type=password])', 'Ana')
  const pws = await page.$$('input[type=password]'); await pws[0].fill('senha123'); await pws[1].fill('senha123')
  await page.tap('button:has-text("Concluir configuração")')
  await page.waitForSelector('text=Primeiros passos')
  await page.screenshot({ path: path.join(shots, 'm1-home.png') })
  const noHorizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
  ok('início sem rolagem horizontal', noHorizontalScroll)

  // Menu em gaveta
  ok('barra superior visível', await page.isVisible('.topbar'))
  await page.tap('button[aria-label="Abrir menu"]')
  await page.waitForSelector('.sidebar.open')
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(shots, 'm2-menu.png') })
  const drawerVisible = await page.$eval('.sidebar.open', (el) => el.getBoundingClientRect().left >= 0 && el.getBoundingClientRect().width > 200)
  ok('gaveta do menu visível', drawerVisible)
  await page.tap('.sidebar.open nav >> text=Pessoas')
  await page.waitForSelector('h1:has-text("Pessoas")')
  ok('navegação pela gaveta', !(await page.isVisible('.sidebar.open')))

  // Pessoa com foto (formulário em tela cheia)
  await page.tap('button:has-text("+ Nova pessoa")')
  await page.waitForSelector('.modal')
  const modalBox = await page.$eval('.modal', (el) => el.getBoundingClientRect().width)
  ok('formulário ocupa a largura do celular', modalBox >= phone.viewport.width - 2, `${modalBox}px`)
  await page.fill('.modal label:has-text("Nome completo") input', 'Beatriz Souza')
  await page.tap('.modal button:has-text("Adicionar foto 3x4")')
  await page.waitForSelector('text=Tirar foto')
  ok('botão de câmera do celular disponível', true)
  await page.setInputFiles('.modal-backdrop:last-of-type input[type=file] >> nth=0', photoFile)
  await page.waitForSelector('.cropper-area')
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(shots, 'm3-foto.png') })
  await page.tap('button:has-text("Usar esta foto")')
  await page.waitForSelector('img[alt="Foto 3x4"]')
  await page.tap('.modal button[type=submit]:has-text("Salvar")')
  await page.waitForSelector('td:has-text("Beatriz Souza")')
  ok('pessoa cadastrada com foto no celular', true)
  await page.screenshot({ path: path.join(shots, 'm4-pessoas.png') })

  // Modelo pronto no editor
  await page.tap('button[aria-label="Abrir menu"]')
  await page.tap('.sidebar.open nav >> text=Modelos de cartão')
  await page.waitForSelector('text=Modelos prontos')
  await page.tap('button:has-text("Usar este modelo") >> nth=0')
  await page.waitForSelector('.editor-stage canvas', { timeout: 20000 })
  await page.waitForTimeout(800)
  const cardWidth = await page.$eval('.editor-card', (el) => el.getBoundingClientRect().width)
  ok('cartão cabe na tela do celular', cardWidth <= phone.viewport.width, `${Math.round(cardWidth)}px de ${phone.viewport.width}px`)
  await page.screenshot({ path: path.join(shots, 'm5-editor.png') })
  await page.tap('button:has-text("Salvar modelo")')
  await page.waitForSelector('text=Modelo salvo.')

  // Impressora simulada e impressão
  await page.tap('button[aria-label="Abrir menu"]')
  await page.tap('.sidebar.open nav >> text=Configurações')
  await page.waitForSelector('h1:has-text("Configurações")')
  const lanInfo = await (await fetch(`http://127.0.0.1:${PORT}/api/settings`, { headers: { cookie: (await context.cookies()).map((c) => `${c.name}=${c.value}`).join('; ') } })).json()
  if (lanInfo.lan?.urls?.length) {
    await page.waitForSelector('img[alt^="QR code"]', { timeout: 15000 }).catch(() => null)
    ok('QR code de acesso pelo celular exibido', await page.isVisible('img[alt^="QR code"]'), lanInfo.lan.urls.join(', '))
  } else {
    ok('aviso de rede local exibido (máquina sem IP de rede)', await page.isVisible('text=nenhuma rede local'))
  }
  await page.screenshot({ path: path.join(shots, 'm6-config.png') })
  await page.tap('button:has-text("+ Simulada (teste)")')
  await page.tap('.modal button:has-text("Salvar")')
  await page.waitForSelector('span.badge:has-text("padrão")')
  await page.tap('button[aria-label="Abrir menu"]')
  await page.tap('.sidebar.open nav >> text=Impressão')
  await page.waitForSelector('text=1. Escolha as pessoas')
  await page.tap('tr:has-text("Beatriz Souza") input[type=checkbox]')
  await page.tap('button:has-text("Gerar pré-visualização")')
  await page.waitForSelector('img.card-preview', { timeout: 20000 })
  await page.screenshot({ path: path.join(shots, 'm7-impressao.png') })
  await page.tap('button:has-text("Imprimir 1 cartão")')
  await page.waitForSelector('.alert.success', { timeout: 20000 })
  ok('impressão enviada pelo celular', true)
  const noHScroll2 = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
  ok('impressão sem rolagem horizontal', noHScroll2)
  ok('manifesto PWA acessível', (await fetch(`http://127.0.0.1:${PORT}/manifest.webmanifest`)).ok)
  ok('sem erros de JavaScript', errors.length === 0, errors.slice(0, 3).join(' | '))
} catch (err) {
  console.error('E2E ERROR:', err)
  results.push({ name: 'exceção', ok: false })
} finally {
  await browser?.close()
  server.kill()
}
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passos OK`)
if (failed.length) process.exit(1)
