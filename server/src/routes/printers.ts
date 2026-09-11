import { Router } from 'express'
import { z } from 'zod'
import { getDb } from '../lib/db.js'
import { HttpError, parseId, validate } from '../lib/http.js'
import { getAdapter, listSystemPrinters, checkNetwork, type PrinterConfig, type PrinterOptions } from '../printer/index.js'

export const printersRouter = Router()

interface PrinterRow {
  id: number
  name: string
  adapter: 'system' | 'mock'
  system_name: string | null
  host: string | null
  model: string
  dpi: number
  duplex: number
  is_default: number
  options_json: string
  created_at: string
  updated_at: string
}

export function rowToConfig(r: PrinterRow): PrinterConfig {
  let options: PrinterOptions = {}
  try {
    options = JSON.parse(r.options_json || '{}')
  } catch {
    options = {}
  }
  return {
    id: r.id,
    name: r.name,
    adapter: r.adapter,
    systemName: r.system_name,
    host: r.host,
    model: r.model,
    dpi: r.dpi,
    duplex: r.duplex === 1,
    isDefault: r.is_default === 1,
    options,
  }
}

export function getPrinter(id: number): PrinterConfig | null {
  const r = getDb().prepare('SELECT * FROM printers WHERE id = ?').get(id) as unknown as PrinterRow | undefined
  return r ? rowToConfig(r) : null
}

export function getDefaultPrinter(): PrinterConfig | null {
  const r = getDb().prepare('SELECT * FROM printers ORDER BY is_default DESC, id ASC LIMIT 1').get() as unknown as PrinterRow | undefined
  return r ? rowToConfig(r) : null
}

const optionsSchema = z.object({
  paperName: z.string().max(100).optional(),
  cupsMedia: z.string().max(100).optional(),
  cupsExtra: z.string().max(500).optional(),
  rotate180: z.boolean().optional(),
  duplexShortEdge: z.boolean().optional(),
  keepOutput: z.boolean().optional(),
})

const printerSchema = z.object({
  name: z.string().trim().min(1, 'Informe um nome para a impressora.').max(120),
  adapter: z.enum(['system', 'mock']),
  systemName: z.string().trim().max(200).nullable().optional(),
  host: z.string().trim().max(200).nullable().optional(),
  model: z.string().trim().max(120).optional(),
  dpi: z.number().int().min(150).max(1200).optional(),
  duplex: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  options: optionsSchema.optional(),
})

printersRouter.get('/', (_req, res) => {
  const rows = getDb().prepare('SELECT * FROM printers ORDER BY is_default DESC, name COLLATE NOCASE').all() as unknown as PrinterRow[]
  res.json(rows.map(rowToConfig))
})

/** Impressoras instaladas no sistema operacional (para escolher a fila da Sigma DS). */
printersRouter.get('/system', async (_req, res) => {
  const printers = await listSystemPrinters()
  res.json({ platform: process.platform, printers })
})

printersRouter.post('/', (req, res) => {
  const body = validate(printerSchema, req.body)
  if (body.adapter === 'system' && !body.systemName && !body.host) {
    throw new HttpError(400, 'Informe o nome da fila no sistema (ou o endereço de rede) da impressora.')
  }
  const db = getDb()
  const count = (db.prepare('SELECT COUNT(*) AS c FROM printers').get() as unknown as { c: number }).c
  const isDefault = body.isDefault || count === 0
  if (isDefault) db.prepare('UPDATE printers SET is_default = 0').run()
  const info = db
    .prepare('INSERT INTO printers (name, adapter, system_name, host, model, dpi, duplex, is_default, options_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(body.name, body.adapter, body.systemName ?? null, body.host ?? null, body.model ?? 'Entrust Sigma DS', body.dpi ?? 300, body.duplex ? 1 : 0, isDefault ? 1 : 0, JSON.stringify(body.options ?? {}))
  res.status(201).json(getPrinter(Number(info.lastInsertRowid)))
})

printersRouter.put('/:id', (req, res) => {
  const id = parseId(req.params.id)
  const existing = getPrinter(id)
  if (!existing) throw new HttpError(404, 'Impressora não encontrada.')
  const body = validate(printerSchema.partial(), req.body)
  const db = getDb()
  const pick = <T>(v: T | undefined, f: T): T => (v === undefined ? f : v)
  const nextAdapter = body.adapter ?? existing.adapter
  if (nextAdapter === 'system' && !pick(body.systemName, existing.systemName) && !pick(body.host, existing.host)) {
    throw new HttpError(400, 'Informe o nome da fila no sistema (ou o endereço de rede) da impressora.')
  }
  if (body.isDefault) db.prepare('UPDATE printers SET is_default = 0').run()
  db.prepare(
    `UPDATE printers SET name = ?, adapter = ?, system_name = ?, host = ?, model = ?, dpi = ?, duplex = ?, is_default = ?, options_json = ?, updated_at = datetime('now') WHERE id = ?`,
  ).run(
    body.name ?? existing.name,
    body.adapter ?? existing.adapter,
    pick(body.systemName, existing.systemName),
    pick(body.host, existing.host),
    body.model ?? existing.model,
    body.dpi ?? existing.dpi,
    (body.duplex ?? existing.duplex) ? 1 : 0,
    body.isDefault ? 1 : existing.isDefault ? 1 : 0,
    JSON.stringify({ ...existing.options, ...(body.options ?? {}) }),
    id,
  )
  res.json(getPrinter(id))
})

printersRouter.delete('/:id', (req, res) => {
  const id = parseId(req.params.id)
  const existing = getPrinter(id)
  if (!existing) throw new HttpError(404, 'Impressora não encontrada.')
  const db = getDb()
  db.exec('BEGIN')
  try {
    db.prepare('DELETE FROM printers WHERE id = ?').run(id)
    const defaults = (db.prepare('SELECT COUNT(*) AS c FROM printers WHERE is_default = 1').get() as unknown as { c: number }).c
    if (defaults !== 1) {
      const remaining = db.prepare('SELECT id FROM printers ORDER BY is_default DESC, id ASC LIMIT 1').get() as unknown as { id: number } | undefined
      db.prepare('UPDATE printers SET is_default = 0').run()
      if (remaining) db.prepare('UPDATE printers SET is_default = 1 WHERE id = ?').run(remaining.id)
    }
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
  res.json({ ok: true })
})

/** Testa conectividade / estado da impressora. */
printersRouter.post('/:id/status', async (req, res) => {
  const p = getPrinter(parseId(req.params.id))
  if (!p) throw new HttpError(404, 'Impressora não encontrada.')
  res.json(await getAdapter(p.adapter).status(p))
})

/** Testa um host de rede antes de salvar. */
printersRouter.post('/check-host', async (req, res) => {
  const host = typeof req.body?.host === 'string' ? req.body.host.trim() : ''
  if (!host) throw new HttpError(400, 'Informe o endereço.')
  res.json(await checkNetwork(host))
})
