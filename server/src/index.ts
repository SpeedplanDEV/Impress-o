import { createApp } from './app.js'
import { config } from './lib/config.js'
import { getDb } from './lib/db.js'
import fs from 'node:fs'

fs.mkdirSync(config.uploadsDir, { recursive: true })
fs.mkdirSync(config.printOutputDir, { recursive: true })
getDb()

const app = createApp()
app.listen(config.port, config.host, () => {
  console.log(`Impress-o rodando em http://${config.host}:${config.port}`)
  console.log(`Dados em: ${config.dataDir}`)
})
