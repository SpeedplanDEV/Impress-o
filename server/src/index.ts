import './lib/env.js'
import { createApp } from './app.js'
import { config } from './lib/config.js'
import { describeDatabase, getDb, nowIso } from './lib/db.js'
import { importarUploadsAntigos } from './lib/assets.js'
import {
  abrirNavegador,
  avisosDeConfiguracao,
  descreverErroDeEscuta,
  enderecosDeEscuta,
  explicarFalhaDeInicio,
  impressoJaRodando,
  mensagemNodeAntigo,
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

/** Quantas portas seguintes tentar quando a padrão está ocupada/reservada (só sem PORT no .env). */
const TENTATIVAS_DE_PORTA = 10

async function main() {
  if (!versaoNodeSuficiente()) {
    console.error(mensagemNodeAntigo())
    process.exit(1)
  }
  for (const aviso of avisosDeConfiguracao({ portInvalida: config.portInvalida, secureCookies: config.secureCookies, hostDefinido: config.hostDefinido, publicUrl: process.env.IMPRESSO_PUBLIC_URL || process.env.RENDER_EXTERNAL_HOSTNAME })) {
    console.warn(`Aviso: ${aviso}`)
  }
  verificarPastaDeDados(config.dataDir)
  fs.mkdirSync(config.printOutputDir, { recursive: true })
  const info = describeDatabase()
  console.log(`Banco de dados: ${info.kind === 'postgres' ? `Postgres (${info.target})` : info.kind === 'pglite' ? 'Postgres em memória' : `SQLite (${info.target})`}`)
  if (info.kind === 'postgres') console.log('Conectando ao banco na nuvem... (pode levar alguns segundos; sem resposta em 15 s o início é cancelado)')
  const db = await getDb()
  // Trabalhos interrompidos por um reinício do servidor não podem ficar "imprimindo" para sempre
  await db.run(`UPDATE print_jobs SET status = 'error', error = 'Interrompido: o servidor foi reiniciado durante a impressão.', finished_at = ? WHERE instance_id = ? AND status IN ('queued', 'printing')`, [nowIso(), config.instanceId])
  const importados = await importarUploadsAntigos()
  if (importados > 0) console.log(`${importados} arquivo(s) de data/uploads importado(s) para o banco.`)

  const app = createApp()
  const enderecos = enderecosDeEscuta(config.hostDefinido)
  const principal = enderecos[0]
  let port = config.port
  // Endereço principal: obrigatório. Sem PORT no .env, uma porta ocupada não impede o uso:
  // se já é o Impress-o, abre o navegador nele; se é outro programa, tenta a porta seguinte.
  for (let tentativa = 0; ; tentativa++) {
    try {
      await escutar(app, principal.host, port)
      break
    } catch (err) {
      const e = err as NodeJS.ErrnoException
      const ocupada = e.code === 'EADDRINUSE' || e.code === 'EACCES'
      if (!ocupada || config.portDefinida || tentativa >= TENTATIVAS_DE_PORTA) throw new Error(descreverErroDeEscuta(e, principal.host, port))
      if (await impressoJaRodando(port, principal.host)) {
        const url = urlLocal(principal.host, port)
        console.log(`O Impress-o já está aberto neste computador em ${url}. Use essa janela (não é preciso abrir outra).`)
        if (config.abrirNavegador) abrirNavegador(url)
        await db.close()
        return
      }
      console.warn(`A porta ${port} está ocupada ou reservada (${e.code}); tentando a porta ${port + 1}...`)
      port += 1
    }
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

main().catch((err) => {
  const e = err as NodeJS.ErrnoException
  console.error('Falha ao iniciar o Impress-o:', e instanceof Error ? e.message : err, e?.code ? `(${e.code})` : '')
  for (const dica of explicarFalhaDeInicio(err, { databaseUrl: config.databaseUrl, dataDir: config.dataDir })) console.error(dica)
  if (config.databaseUrl) console.error('Verifique a variável DATABASE_URL (Supabase/Neon) e a conexão com a internet.')
  process.exit(1)
})
