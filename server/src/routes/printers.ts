import { Router } from 'express'
import { z } from 'zod'
import { getDb, nowIso } from '../lib/db.js'
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
    dpi: Number(r.dpi),
    duplex: Number(r.duplex) === 1,
    isDefault: Number(r.is_default) === 1,
    options,
  }
}

export async function getPrinter(id: number): Promise<PrinterConfig | null> {
  const db = await getDb()
  const r = await db.get<PrinterRow>('SELECT * FROM printers WHERE id = ?', [id])
  return r ? rowToConfig(r) : null
}

export async function getDefaultPrinter(): Promise<PrinterConfig | null> {
  const db = await getDb()
  const r = await db.get<PrinterRow>('SELECT * FROM printers ORDER BY is_default DESC, id ASC LIMIT 1')
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

printersRouter.get('/', async (_req, res) => {
  const db = await getDb()
  const rows = await db.all<PrinterRow>('SELECT * FROM printers ORDER BY is_default DESC, lower(name)')
  res.json(rows.map(rowToConfig))
})

/** Impressoras instaladas no sistema operacional (para escolher a fila da Sigma DS). */
printersRouter.get('/system', async (_req, res) => {
  const printers = await listSystemPrinters()
  res.json({ platform: process.platform, printers })
})

printersRouter.post('/', async (req, res) => {
  const body = validate(printerSchema, req.body)
  if (body.adapter === 'system' && !body.systemName && !body.host) {
    throw new HttpError(400, 'Informe o nome da fila no sistema (ou o endereço de rede) da impressora.')
  }
  const db = await getDb()
  const id = await db.transaction(async (tx) => {
    const count = Number((await tx.get<{ c: number }>('SELECT COUNT(*) AS c FROM printers'))!.c)
    const isDefault = body.isDefault || count === 0
    if (isDefault) await tx.run('UPDATE printers SET is_default = 0')
    const row = await tx.get<{ id: number }>(
      'INSERT INTO printers (name, adapter, system_name, host, model, dpi, duplex, is_default, options_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
      [body.name, body.adapter, body.systemName ?? null, body.host ?? null, body.model ?? 'Entrust Sigma DS', body.dpi ?? 300, body.duplex ? 1 : 0, isDefault ? 1 : 0, JSON.stringify(body.options ?? {})],
    )
    return row!.id
  })
  res.status(201).json(await getPrinter(id))
})

printersRouter.put('/:id', async (req, res) => {
  const id = parseId(req.params.id)
  const existing = await getPrinter(id)
  if (!existing) throw new HttpError(404, 'Impressora não encontrada.')
  const body = validate(printerSchema.partial(), req.body)
  const pick = <T>(v: T | undefined, f: T): T => (v === undefined ? f : v)
  const nextAdapter = body.adapter ?? existing.adapter
  if (nextAdapter === 'system' && !pick(body.systemName, existing.systemName) && !pick(body.host, existing.host)) {
    throw new HttpError(400, 'Informe o nome da fila no sistema (ou o endereço de rede) da impressora.')
  }
  const db = await getDb()
  await db.transaction(async (tx) => {
    if (body.isDefault) await tx.run('UPDATE printers SET is_default = 0')
    await tx.run(
      'UPDATE printers SET name = ?, adapter = ?, system_name = ?, host = ?, model = ?, dpi = ?, duplex = ?, is_default = ?, options_json = ?, updated_at = ? WHERE id = ?',
      [
        body.name ?? existing.name,
        nextAdapter,
        pick(body.systemName, existing.systemName),
        pick(body.host, existing.host),
        body.model ?? existing.model,
        body.dpi ?? existing.dpi,
        (body.duplex ?? existing.duplex) ? 1 : 0,
        body.isDefault ? 1 : existing.isDefault ? 1 : 0,
        JSON.stringify({ ...existing.options, ...(body.options ?? {}) }),
        nowIso(),
        id,
      ],
    )
  })
  res.json(await getPrinter(id))
})

printersRouter.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id)
  const existing = await getPrinter(id)
  if (!existing) throw new HttpError(404, 'Impressora não encontrada.')
  const db = await getDb()
  await db.transaction(async (tx) => {
    await tx.run('DELETE FROM printers WHERE id = ?', [id])
    const defaults = Number((await tx.get<{ c: number }>('SELECT COUNT(*) AS c FROM printers WHERE is_default = 1'))!.c)
    if (defaults !== 1) {
      const remaining = await tx.get<{ id: number }>('SELECT id FROM printers ORDER BY is_default DESC, id ASC LIMIT 1')
      await tx.run('UPDATE printers SET is_default = 0')
      if (remaining) await tx.run('UPDATE printers SET is_default = 1 WHERE id = ?', [remaining.id])
    }
  })
  res.json({ ok: true })
})

/** Testa conectividade / estado da impressora. */
printersRouter.post('/:id/status', async (req, res) => {
  const p = await getPrinter(parseId(req.params.id))
  if (!p) throw new HttpError(404, 'Impressora não encontrada.')
  res.json(await getAdapter(p.adapter).status(p))
})

/** Testa um host de rede antes de salvar. */
printersRouter.post('/check-host', async (req, res) => {
  const host = typeof req.body?.host === 'string' ? req.body.host.trim() : ''
  if (!host) throw new HttpError(400, 'Informe o endereço.')
  res.json(await checkNetwork(host))
})
