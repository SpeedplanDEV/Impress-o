import { config as loadEnv } from 'dotenv'
import { createApp } from './app.js'
import { config } from './lib/config.js'
import { describeDatabase, getDb, nowIso } from './lib/db.js'
import { importarUploadsAntigos } from './lib/assets.js'
import fs from 'node:fs'

loadEnv({ quiet: true })

async function main() {
  fs.mkdirSync(config.printOutputDir, { recursive: true })
  const info = describeDatabase()
  console.log(`Banco de dados: ${info.kind === 'postgres' ? `Postgres (${info.target})` : info.kind === 'pglite' ? 'Postgres em memória' : `SQLite (${info.target})`}`)
  const db = await getDb()
  // Trabalhos interrompidos por um reinício do servidor não podem ficar "imprimindo" para sempre
  await db.run(`UPDATE print_jobs SET status = 'error', error = 'Interrompido: o servidor foi reiniciado durante a impressão.', finished_at = ? WHERE status IN ('queued', 'printing')`, [nowIso()])
  const importados = await importarUploadsAntigos()
  if (importados > 0) console.log(`${importados} arquivo(s) de data/uploads importado(s) para o banco.`)

  const app = createApp()
  app.listen(config.port, config.host, () => {
    console.log(`Impress-o rodando em http://${config.host}:${config.port}`)
    console.log(`Dados em: ${config.dataDir}`)
  })
}

main().catch((err) => {
  console.error('Falha ao iniciar o Impress-o:', err instanceof Error ? err.message : err)
  if (config.databaseUrl) console.error('Verifique a variável DATABASE_URL (Supabase/Neon) e a conexão com a internet.')
  process.exit(1)
})
