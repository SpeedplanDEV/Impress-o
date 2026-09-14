import './lib/env.js'
import { createApp } from './app.js'
import { config } from './lib/config.js'
import { describeDatabase, getDb, nowIso } from './lib/db.js'
import { importarUploadsAntigos } from './lib/assets.js'
import { abrirNavegador, descreverErroDeEscuta, enderecosDeEscuta, mensagemNodeAntigo, urlLocal, versaoNodeSuficiente } from './lib/startup.js'
import fs from 'node:fs'
import http from 'node:http'
import type express from 'express'

/** Sobe um servidor HTTP em um endereço; endereços opcionais (IPv6 local) falham em silêncio. */
function escutar(app: express.Express, host: string, port: number, obrigatorio: boolean): Promise<http.Server | null> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app)
    server.once('error', (err: NodeJS.ErrnoException) => {
      if (obrigatorio) reject(new Error(descreverErroDeEscuta(err, host, port)))
      else resolve(null)
    })
    server.listen(port, host, () => resolve(server))
  })
}

async function main() {
  if (!versaoNodeSuficiente()) {
    console.error(mensagemNodeAntigo())
    process.exit(1)
  }
  fs.mkdirSync(config.printOutputDir, { recursive: true })
  const info = describeDatabase()
  console.log(`Banco de dados: ${info.kind === 'postgres' ? `Postgres (${info.target})` : info.kind === 'pglite' ? 'Postgres em memória' : `SQLite (${info.target})`}`)
  const db = await getDb()
  // Trabalhos interrompidos por um reinício do servidor não podem ficar "imprimindo" para sempre
  await db.run(`UPDATE print_jobs SET status = 'error', error = 'Interrompido: o servidor foi reiniciado durante a impressão.', finished_at = ? WHERE instance_id = ? AND status IN ('queued', 'printing')`, [nowIso(), config.instanceId])
  const importados = await importarUploadsAntigos()
  if (importados > 0) console.log(`${importados} arquivo(s) de data/uploads importado(s) para o banco.`)

  const app = createApp()
  const enderecos = enderecosDeEscuta(config.hostDefinido)
  for (const { host, obrigatorio } of enderecos) {
    const server = await escutar(app, host, config.port, obrigatorio)
    if (server && obrigatorio) console.log(`Impress-o rodando em ${urlLocal(host, config.port)}`)
  }
  console.log(`Dados em: ${config.dataDir}`)
  if (config.lanEnabled) {
    for (const url of config.lanUrls) console.log(`Acesso pelo celular (mesma rede Wi-Fi): ${url}`)
  } else {
    console.log('Para acessar pelo celular, defina HOST=0.0.0.0 no arquivo .env (veja Configurações > Acesso pelo celular).')
  }
  if (config.abrirNavegador) {
    const url = urlLocal(enderecos[0].host, config.port)
    console.log(`Abrindo o navegador em ${url} ... (se não abrir, acesse esse endereço manualmente)`)
    abrirNavegador(url)
  }
}

main().catch((err) => {
  console.error('Falha ao iniciar o Impress-o:', err instanceof Error ? err.message : err)
  if (config.databaseUrl) console.error('Verifique a variável DATABASE_URL (Supabase/Neon) e a conexão com a internet.')
  process.exit(1)
})
