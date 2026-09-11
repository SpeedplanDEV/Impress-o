import { Router } from 'express'
import { z } from 'zod'
import path from 'node:path'
import fs from 'node:fs'
import { getDb, nowIso } from '../lib/db.js'
import { config } from '../lib/config.js'
import { HttpError, parseId, validate } from '../lib/http.js'
import { getAdapter, type PrinterConfig, type PrintJobRequest, type PrintResult } from '../printer/index.js'
import { getPrinter, getDefaultPrinter } from './printers.js'
import { getActiveCostParams } from './cost.js'
import { computeCardCost } from '../../../shared/cost.js'
import { cardPixelSize } from '../../../shared/card.js'
import { imageSize } from '../lib/assets.js'
import { buildCardPdf } from '../lib/pdf.js'
import { buildCalibrationCard } from '../lib/png.js'

export const printRouter = Router()

function pngFromDataUrl(dataUrl: string, label: string): Buffer {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl)
  if (!m) throw new HttpError(400, `${label}: esperado PNG em data URL.`)
  const buf = Buffer.from(m[1].replace(/\s/g, ''), 'base64')
  if (buf.length < 100) throw new HttpError(400, `${label}: imagem vazia.`)
  return buf
}

function checkSize(buf: Buffer, orientation: 'landscape' | 'portrait', label: string): { width: number; height: number } {
  const size = imageSize('image/png', buf)
  if (!size) throw new HttpError(400, `${label}: não foi possível ler as dimensões do PNG.`)
  const expected = cardPixelSize(orientation)
  // Tolerância de 2 px para arredondamentos do canvas
  if (Math.abs(size.width - expected.width) > 2 || Math.abs(size.height - expected.height) > 2) {
    throw new HttpError(400, `${label}: a imagem tem ${size.width}×${size.height} px, mas o cartão CR80 a 300 dpi exige ${expected.width}×${expected.height} px.`)
  }
  return size
}

const jobSchema = z.object({
  printerId: z.number().int().positive().optional(),
  personId: z.number().int().positive().nullable().optional(),
  templateId: z.number().int().positive().nullable().optional(),
  personName: z.string().max(200).nullable().optional(),
  templateName: z.string().max(200).nullable().optional(),
  orientation: z.enum(['landscape', 'portrait']).default('landscape'),
  copies: z.number().int().min(1).max(100).default(1),
  frontPng: z.string().min(100),
  backPng: z.string().min(100).nullable().optional(),
})

interface JobRow {
  id: number
  printer_id: number | null
  printer_name: string | null
  person_id: number | null
  template_id: number | null
  person_name: string | null
  template_name: string | null
  copies: number
  sides: number
  status: string
  error: string | null
  cost_json: string | null
  unit_cost: number | null
  total_cost: number | null
  output_path: string | null
  instance_id: string | null
  created_at: string
  finished_at: string | null
}

function serializeJob(j: JobRow) {
  return {
    id: j.id,
    printerId: j.printer_id,
    printerName: j.printer_name,
    personId: j.person_id,
    templateId: j.template_id,
    personName: j.person_name,
    templateName: j.template_name,
    copies: Number(j.copies),
    sides: Number(j.sides),
    status: j.status,
    error: j.error,
    cost: j.cost_json ? JSON.parse(j.cost_json) : null,
    unitCost: j.unit_cost,
    totalCost: j.total_cost,
    outputPath: j.output_path,
    thisMachine: !j.instance_id || j.instance_id === config.instanceId,
    createdAt: j.created_at,
    finishedAt: j.finished_at,
  }
}

async function getJob(id: number): Promise<JobRow | null> {
  const db = await getDb()
  return (await db.get<JobRow>('SELECT * FROM print_jobs WHERE id = ?', [id])) ?? null
}

/** Executa o adaptador e sempre fecha o job (mesmo se o adaptador lançar exceção). */
async function runJob(jobId: number, printer: PrinterConfig, request: Omit<PrintJobRequest, 'workDir'>): Promise<PrintResult> {
  const workDir = path.join(config.printOutputDir, `job-${String(jobId).padStart(6, '0')}`)
  let result: PrintResult
  try {
    result = await getAdapter(printer.adapter).print(printer, { ...request, workDir })
  } catch (err) {
    result = { ok: false, message: `Falha ao executar a impressão: ${err instanceof Error ? err.message : String(err)}` }
  }
  const db = await getDb()
  await db.run('UPDATE print_jobs SET status = ?, error = ?, output_path = ?, finished_at = ? WHERE id = ?', [
    result.ok ? 'done' : 'error',
    result.ok ? null : `${result.message}${result.details ? `\n${result.details}` : ''}`.slice(0, 4000),
    result.outputPath ?? null,
    nowIso(),
    jobId,
  ])
  if (!result.ok) {
    // Mantém as imagens para diagnóstico quando falhar
    try {
      fs.mkdirSync(workDir, { recursive: true })
      if (!fs.existsSync(path.join(workDir, 'frente.png'))) fs.writeFileSync(path.join(workDir, 'frente.png'), request.frontPng)
      if (request.backPng && !fs.existsSync(path.join(workDir, 'verso.png'))) fs.writeFileSync(path.join(workDir, 'verso.png'), request.backPng)
    } catch {
      /* ignore */
    }
  }
  return result
}

/** Cria e executa um trabalho de impressão. */
printRouter.post('/jobs', async (req, res) => {
  const body = validate(jobSchema, req.body)
  const printer = body.printerId ? await getPrinter(body.printerId) : await getDefaultPrinter()
  if (!printer) throw new HttpError(400, 'Nenhuma impressora configurada. Cadastre a Sigma DS em Configurações.')
  if (printer.instanceId && printer.instanceId !== config.instanceId) throw new HttpError(400, 'Essa impressora está cadastrada em outro computador. Cadastre a impressora deste computador em Configurações.')

  const frontPng = pngFromDataUrl(body.frontPng, 'Frente')
  checkSize(frontPng, body.orientation, 'Frente')
  const backPng = body.backPng ? pngFromDataUrl(body.backPng, 'Verso') : null
  if (backPng) checkSize(backPng, body.orientation, 'Verso')
  const sides: 1 | 2 = backPng ? 2 : 1
  if (backPng && printer.adapter === 'system' && !printer.duplex) {
    throw new HttpError(400, `A impressora "${printer.name}" não está configurada para frente e verso. Ative "Imprime frente e verso" nas configurações da impressora (DS2/DS3/DSE) ou use um modelo só frente.`)
  }

  const db = await getDb()
  if (body.personId && !(await db.get('SELECT 1 AS ok FROM persons WHERE id = ?', [body.personId]))) throw new HttpError(404, 'Pessoa não encontrada.')
  if (body.templateId && !(await db.get('SELECT 1 AS ok FROM templates WHERE id = ?', [body.templateId]))) throw new HttpError(404, 'Modelo não encontrado.')

  const costParams = await getActiveCostParams()
  const cost = computeCardCost(costParams, { sides, quantity: body.copies })

  const inserted = await db.get<{ id: number }>(
    `INSERT INTO print_jobs (printer_id, printer_name, person_id, template_id, person_name, template_name, copies, sides, status, cost_json, unit_cost, total_cost, instance_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'printing', ?, ?, ?, ?) RETURNING id`,
    [printer.id, printer.name, body.personId ?? null, body.templateId ?? null, body.personName ?? null, body.templateName ?? null, body.copies, sides, JSON.stringify(cost), cost.unitCost, cost.totalCost, config.instanceId],
  )
  const jobId = inserted!.id

  const result = await runJob(jobId, printer, {
    frontPng,
    backPng,
    orientation: body.orientation,
    copies: body.copies,
    jobName: `Impress-o #${jobId} ${body.personName ?? ''}`.trim(),
  })
  res.status(result.ok ? 201 : 502).json({ ok: result.ok, error: result.ok ? undefined : result.message, job: serializeJob((await getJob(jobId))!), result })
})

printRouter.get('/jobs', async (req, res) => {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit ?? 100) || 100))
  const db = await getDb()
  const rows = await db.all<JobRow>('SELECT * FROM print_jobs ORDER BY id DESC LIMIT ?', [limit])
  res.json(rows.map(serializeJob))
})

printRouter.get('/jobs/:id', async (req, res) => {
  const j = await getJob(parseId(req.params.id))
  if (!j) throw new HttpError(404, 'Trabalho não encontrado.')
  res.json(serializeJob(j))
})

/** Imagem gravada de um trabalho (mock ou keepOutput). */
printRouter.get('/jobs/:id/output/:side', async (req, res) => {
  const j = await getJob(parseId(req.params.id))
  if (!j) throw new HttpError(404, 'Trabalho não encontrado.')
  const side = req.params.side === 'verso' ? 'verso' : 'frente'
  if (j.instance_id && j.instance_id !== config.instanceId) throw new HttpError(404, 'O arquivo deste trabalho está em outro computador.')
  const dir = j.output_path ?? path.join(config.printOutputDir, `job-${String(j.id).padStart(6, '0')}`)
  const file = path.join(dir, `${side}.png`)
  if (!fs.existsSync(file)) throw new HttpError(404, 'Arquivo de saída não disponível para este trabalho.')
  res.setHeader('Content-Type', 'image/png')
  res.sendFile(file)
})

printRouter.delete('/jobs/:id', async (req, res) => {
  const id = parseId(req.params.id)
  if (!(await getJob(id))) throw new HttpError(404, 'Trabalho não encontrado.')
  const db = await getDb()
  await db.run('DELETE FROM print_jobs WHERE id = ?', [id])
  res.json({ ok: true })
})

/** Gera um PDF no tamanho exato do cartão (para gráfica ou impressão manual). */
printRouter.post('/pdf', async (req, res) => {
  const body = validate(
    z.object({
      orientation: z.enum(['landscape', 'portrait']).default('landscape'),
      frontPng: z.string().min(100),
      backPng: z.string().min(100).nullable().optional(),
      fileName: z.string().max(200).optional(),
    }),
    req.body,
  )
  const frontPng = pngFromDataUrl(body.frontPng, 'Frente')
  checkSize(frontPng, body.orientation, 'Frente')
  const backPng = body.backPng ? pngFromDataUrl(body.backPng, 'Verso') : null
  if (backPng) checkSize(backPng, body.orientation, 'Verso')
  const pdf = await buildCardPdf({ frontPng, backPng, orientation: body.orientation })
  const name = (body.fileName ?? 'cartao').replace(/[^\w\-]+/g, '_') || 'cartao'
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${name}.pdf"`)
  res.send(pdf)
})

/** Cartão de teste de alinhamento (PNG 1013×638) para calibrar margens/escala do driver. */
printRouter.get('/calibration.png', (req, res) => {
  const orientation = req.query.orientation === 'portrait' ? 'portrait' : 'landscape'
  const size = cardPixelSize(orientation)
  res.setHeader('Content-Type', 'image/png')
  res.send(buildCalibrationCard(size.width, size.height))
})

/** Envia o cartão de teste diretamente à impressora informada. */
printRouter.post('/calibration', async (req, res) => {
  const body = validate(z.object({ printerId: z.number().int().positive().optional(), orientation: z.enum(['landscape', 'portrait']).default('landscape') }), req.body)
  const printer = body.printerId ? await getPrinter(body.printerId) : await getDefaultPrinter()
  if (!printer) throw new HttpError(400, 'Nenhuma impressora configurada.')
  const size = cardPixelSize(body.orientation)
  const png = buildCalibrationCard(size.width, size.height)
  const cost = computeCardCost(await getActiveCostParams(), { sides: 1, quantity: 1 })
  const db = await getDb()
  const inserted = await db.get<{ id: number }>(
    `INSERT INTO print_jobs (printer_id, printer_name, person_name, template_name, copies, sides, status, cost_json, unit_cost, total_cost, instance_id) VALUES (?, ?, 'Cartão de teste', 'Calibração', 1, 1, 'printing', ?, ?, ?, ?) RETURNING id`,
    [printer.id, printer.name, JSON.stringify(cost), cost.unitCost, cost.totalCost, config.instanceId],
  )
  const jobId = inserted!.id
  const result = await runJob(jobId, printer, { frontPng: png, backPng: null, orientation: body.orientation, copies: 1, jobName: `Impress-o #${jobId} teste` })
  res.status(result.ok ? 201 : 502).json({ ok: result.ok, error: result.ok ? undefined : result.message, job: serializeJob((await getJob(jobId))!), result })
})
