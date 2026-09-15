import './lib/env.js'
import { createApp } from './app.js'
import { config } from './lib/config.js'
import { describeDatabase, getDb, nowIso } from './lib/db.js'
import { importarUploadsAntigos } from './lib/assets.js'
import {
  SAIDA_JA_ABERTO,
  abrirNavegador,
  avisosDeConfiguracao,
  enderecosDeEscuta,
  erroDeEscuta,
  explicarFalhaDeInicio,
  impressoJaRodando,
  mensagemNodeAntigo,
  mensagemSemPortaLivre,
  portasCandidatas,
  urlLocal,
  verificarPastaDeDados,
  versaoNodeSuficiente,
} from './lib/startup.js'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import type express from 'express'

/** Sobe um servidor HTTP em um endereço; rejeita com o erro original (código preservado). */
function escutar(app: express.Express, host: string, port: number): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app)
    server.once('error', reject)
    server.listen(port, host, () => resolve(server))
  })
}

/** Outra cópia do Impress-o já atende nesta porta: abre o navegador nela e encerra sem erro. */
function jaAberto(port: number): void {
  const url = urlLocal('127.0.0.1', port)
  console.log(`O Impress-o já está aberto neste computador em ${url}. Abrindo o navegador nele.`)
  console.log('Esta janela pode ser fechada; mantenha aberta a janela que já estava rodando o Impress-o.')
  if (config.abrirNavegador) abrirNavegador(url)
  process.exitCode = SAIDA_JA_ABERTO
}

async function main() {
  if (!versaoNodeSuficiente()) {
    console.error(mensagemNodeAntigo())
    process.exit(1)
  }
  for (const aviso of avisosDeConfiguracao({
    portInvalida: config.portInvalida,
    secureCookies: config.secureCookies,
    hostDefinido: config.hostDefinido,
    publicUrl: process.env.IMPRESSO_PUBLIC_URL || process.env.RENDER_EXTERNAL_HOSTNAME,
    databaseUrlOriginal: config.databaseUrlOriginal,
    databaseUrlIgnorada: config.databaseUrlIgnorada,
  })) {
    console.warn(`Aviso: ${aviso}`)
  }
  const enderecos = enderecosDeEscuta(config.hostDefinido)
  const principal = enderecos[0]
  // Antes de tocar no banco: se outra cópia já atende na porta, não há o que iniciar
  // (e os trabalhos de impressão dela não podem ser marcados como interrompidos).
  if (await impressoJaRodando(config.port, principal.host)) return jaAberto(config.port)

  try {
    verificarPastaDeDados(config.dataDir)
    fs.mkdirSync(config.printOutputDir, { recursive: true })
  } catch (err) {
    // Com banco na nuvem a pasta local só guarda arquivos de impressão: avisa e segue
    if (!config.databaseUrl) throw err
    console.warn(`Aviso: a pasta de dados (${config.dataDir}) não aceita gravação; a impressão pode falhar ao gravar arquivos. Defina IMPRESSO_DATA_DIR no .env se necessário.`)
  }
  const info = describeDatabase()
  console.log(`Banco de dados: ${info.kind === 'postgres' ? `Postgres (${info.target})` : info.kind === 'pglite' ? 'Postgres em memória' : `SQLite (${info.target})`}`)
  if (info.kind === 'postgres') console.log('Conectando ao banco na nuvem... (pode levar alguns segundos; sem resposta em 15 s o início é cancelado)')
  const db = await getDb()
  bancoPronto = true
  // Trabalhos interrompidos por um reinício do servidor não podem ficar "imprimindo" para sempre
  await db.run(`UPDATE print_jobs SET status = 'error', error = 'Interrompido: o servidor foi reiniciado durante a impressão.', finished_at = ? WHERE instance_id = ? AND status IN ('queued', 'printing')`, [nowIso(), config.instanceId])
  const importados = await importarUploadsAntigos()
  if (importados > 0) console.log(`${importados} arquivo(s) de data/uploads importado(s) para o banco.`)

  const app = createApp()
  // Sem PORT fixa (e fora do modo de desenvolvimento), uma porta ocupada ou reservada não impede o uso:
  // tenta as candidatas em ordem; se a ocupante for outro Impress-o, abre o navegador nela.
  const candidatas = config.portDefinida || !config.compilado ? [config.port] : portasCandidatas(config.port)
  let port: number | null = null
  let ultimo: NodeJS.ErrnoException | null = null
  for (const p of candidatas) {
    try {
      await escutar(app, principal.host, p)
      port = p
      break
    } catch (err) {
      const e = err as NodeJS.ErrnoException
      if (e.code !== 'EADDRINUSE' && e.code !== 'EACCES') throw erroDeEscuta(e, principal.host, p)
      if (e.code === 'EADDRINUSE' && (await impressoJaRodando(p, principal.host))) {
        await db.close()
        return jaAberto(p)
      }
      ultimo = e
      if (candidatas.length > 1) console.warn(`A porta ${p} está ocupada ou reservada (${e.code}); tentando outra...`)
    }
  }
  if (port === null) {
    const e = ultimo as NodeJS.ErrnoException
    throw candidatas.length > 1 ? Object.assign(new Error(mensagemSemPortaLivre(candidatas, e.code)), { code: 'ERR_IMPRESSO_LISTEN' }) : erroDeEscuta(e, principal.host, config.port)
  }
  config.port = port
  for (const { host } of enderecos.slice(1)) {
    // Endereços opcionais (IPv6 local): falham em silêncio, exceto quando outro programa ocupa a porta
    try {
      await escutar(app, host, port)
    } catch (err) {
      const e = err as NodeJS.ErrnoException
      if (e.code === 'EADDRINUSE') console.warn(`Aviso: [${host}]:${port} está ocupada por outro programa; se http://localhost:${port} abrir a página errada, use http://127.0.0.1:${port}.`)
    }
  }
  const url = urlLocal(principal.host, port)
  console.log(`Impress-o rodando em ${url}`)
  console.log(`Dados em: ${config.dataDir}`)
  if (!fs.existsSync(path.join(config.clientDist, 'index.html'))) {
    console.warn('Aviso: a interface ainda não foi compilada (pasta dist/client). Execute iniciar.bat ou "npm run build". Em desenvolvimento ("npm run dev"), a interface fica em http://localhost:5173.')
  }
  if (config.lanEnabled) {
    for (const u of config.lanUrls) console.log(`Acesso pelo celular (mesma rede Wi-Fi): ${u}`)
  } else {
    console.log('Para acessar pelo celular, defina HOST=0.0.0.0 no arquivo .env (veja Configurações > Acesso pelo celular).')
  }
  console.log('Mantenha esta janela aberta enquanto usar o sistema.')
  if (config.abrirNavegador) {
    console.log(`Abrindo o navegador em ${url} ... (se não abrir, digite esse endereço no navegador)`)
    abrirNavegador(url)
  }
}

let bancoPronto = false

main().catch((err) => {
  const e = err as NodeJS.ErrnoException
  console.error('Falha ao iniciar o Impress-o:', e instanceof Error ? e.message : err, e?.code && e.code !== 'ERR_IMPRESSO_LISTEN' ? `(${e.code})` : '')
  for (const dica of explicarFalhaDeInicio(err, { databaseUrl: config.databaseUrl, dataDir: config.dataDir })) console.error(dica)
  if (config.databaseUrl && !bancoPronto) console.error('Verifique a variável DATABASE_URL (Supabase/Neon) e a conexão com a internet.')
  process.exit(1)
})
