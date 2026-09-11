import { Router } from 'express'
import { getDb, getJsonSetting, setJsonSetting } from '../lib/db.js'
import { config } from '../lib/config.js'

export const settingsRouter = Router()

export interface AppSettings {
  /** Nome exibido no sistema (ex.: nome da gráfica/empresa). */
  organizationName: string
  /** Campos extras padrão para novas pessoas. */
  extraFields: string[]
}

const DEFAULTS: AppSettings = { organizationName: '', extraFields: [] }

settingsRouter.get('/', (_req, res) => {
  const db = getDb()
  const counts = {
    companies: (db.prepare('SELECT COUNT(*) AS c FROM companies').get() as unknown as { c: number }).c,
    departments: (db.prepare('SELECT COUNT(*) AS c FROM departments').get() as unknown as { c: number }).c,
    persons: (db.prepare('SELECT COUNT(*) AS c FROM persons').get() as unknown as { c: number }).c,
    templates: (db.prepare('SELECT COUNT(*) AS c FROM templates').get() as unknown as { c: number }).c,
    printers: (db.prepare('SELECT COUNT(*) AS c FROM printers').get() as unknown as { c: number }).c,
    jobs: (db.prepare('SELECT COUNT(*) AS c FROM print_jobs').get() as unknown as { c: number }).c,
    jobsDone: (db.prepare("SELECT COUNT(*) AS c FROM print_jobs WHERE status = 'done'").get() as unknown as { c: number }).c,
    cardsPrinted: (db.prepare("SELECT COALESCE(SUM(copies), 0) AS c FROM print_jobs WHERE status = 'done'").get() as unknown as { c: number }).c,
    totalCost: (db.prepare("SELECT COALESCE(SUM(total_cost), 0) AS c FROM print_jobs WHERE status = 'done'").get() as unknown as { c: number }).c,
  }
  res.json({
    settings: { ...DEFAULTS, ...getJsonSetting<Partial<AppSettings>>('app_settings', {}) },
    paths: { dataDir: config.dataDir, dbPath: config.dbPath, uploadsDir: config.uploadsDir, printOutputDir: config.printOutputDir },
    platform: process.platform,
    nodeVersion: process.version,
    counts,
  })
})

settingsRouter.put('/', (req, res) => {
  const current = { ...DEFAULTS, ...getJsonSetting<Partial<AppSettings>>('app_settings', {}) }
  const body = (req.body ?? {}) as Partial<AppSettings>
  const next: AppSettings = {
    organizationName: typeof body.organizationName === 'string' ? body.organizationName.slice(0, 200) : current.organizationName,
    extraFields: Array.isArray(body.extraFields) ? body.extraFields.filter((f): f is string => typeof f === 'string').map((f) => f.trim()).filter(Boolean).slice(0, 30) : current.extraFields,
  }
  setJsonSetting('app_settings', next)
  res.json({ settings: next })
})
