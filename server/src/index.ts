import { createApp } from './app.js'
import { config } from './lib/config.js'
import { getDb } from './lib/db.js'
import fs from 'node:fs'

fs.mkdirSync(config.uploadsDir, { recursive: true })
fs.mkdirSync(config.printOutputDir, { recursive: true })
const db = getDb()
// Trabalhos interrompidos por um reinício do servidor não podem ficar "imprimindo" para sempre
db.prepare(`UPDATE print_jobs SET status = 'error', error = 'Interrompido: o servidor foi reiniciado durante a impressão.', finished_at = datetime('now') WHERE status IN ('queued', 'printing')`).run()

const app = createApp()
app.listen(config.port, config.host, () => {
  console.log(`Impress-o rodando em http://${config.host}:${config.port}`)
  console.log(`Dados em: ${config.dataDir}`)
})
