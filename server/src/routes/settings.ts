import { Router } from 'express'
import { describeDatabase, getDb, getJsonSetting, setJsonSetting } from '../lib/db.js'
import { config } from '../lib/config.js'

export const settingsRouter = Router()

export interface AppSettings {
  /** Nome exibido no sistema (ex.: nome da gráfica/empresa). */
  organizationName: string
  /** Campos extras padrão para novas pessoas. */
  extraFields: string[]
}

const DEFAULTS: AppSettings = { organizationName: '', extraFields: [] }

settingsRouter.get('/', async (_req, res) => {
  const db = await getDb()
  const count = async (sql: string) => Number((await db.get<{ c: number }>(sql))?.c ?? 0)
  const counts = {
    companies: await count('SELECT COUNT(*) AS c FROM companies'),
    departments: await count('SELECT COUNT(*) AS c FROM departments'),
    persons: await count('SELECT COUNT(*) AS c FROM persons'),
    templates: await count('SELECT COUNT(*) AS c FROM templates'),
    printers: await count('SELECT COUNT(*) AS c FROM printers'),
    jobs: await count('SELECT COUNT(*) AS c FROM print_jobs'),
    jobsDone: await count("SELECT COUNT(*) AS c FROM print_jobs WHERE status = 'done'"),
    cardsPrinted: await count("SELECT COALESCE(SUM(copies), 0) AS c FROM print_jobs WHERE status = 'done'"),
    totalCost: await count("SELECT COALESCE(SUM(total_cost), 0) AS c FROM print_jobs WHERE status = 'done'"),
  }
  const database = describeDatabase()
  res.json({
    settings: { ...DEFAULTS, ...(await getJsonSetting<Partial<AppSettings>>('app_settings', {})) },
    paths: { dataDir: config.dataDir, dbPath: config.dbPath, uploadsDir: config.uploadsDir, printOutputDir: config.printOutputDir },
    database,
    instance: { id: config.instanceId, name: config.instanceName },
    platform: process.platform,
    nodeVersion: process.version,
    counts,
  })
})

settingsRouter.put('/', async (req, res) => {
  const current = { ...DEFAULTS, ...(await getJsonSetting<Partial<AppSettings>>('app_settings', {})) }
  const body = (req.body ?? {}) as Partial<AppSettings>
  const next: AppSettings = {
    organizationName: typeof body.organizationName === 'string' ? body.organizationName.slice(0, 200) : current.organizationName,
    extraFields: Array.isArray(body.extraFields) ? body.extraFields.filter((f): f is string => typeof f === 'string').map((f) => f.trim()).filter(Boolean).slice(0, 30) : current.extraFields,
  }
  await setJsonSetting('app_settings', next)
  res.json({ settings: next })
})
