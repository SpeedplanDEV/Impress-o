import { Router } from 'express'
import { z } from 'zod'
import { getDb, nowIso } from '../lib/db.js'
import { HttpError, parseId, validate } from '../lib/http.js'
import { validateTemplateDoc, emptyTemplateDoc, type CardTemplateDoc, TEMPLATE_FORMAT, TEMPLATE_VERSION } from '../../../shared/template.js'
import { getCompany, getDepartment } from './companies.js'
import { getPerson } from './persons.js'
import { BUILTIN_TEMPLATES } from '../lib/builtinTemplates.js'

export const templatesRouter = Router()

export interface TemplateRow {
  id: number
  name: string
  company_id: number | null
  department_id: number | null
  orientation: 'landscape' | 'portrait'
  double_sided: number
  design_json: string
  thumbnail: string | null
  source: 'editor' | 'import' | 'builtin'
  created_at: string
  updated_at: string
}

interface TemplateJoined extends TemplateRow {
  company_name: string | null
  department_name: string | null
}

const SELECT = `SELECT t.*, c.name AS company_name, d.name AS department_name
  FROM templates t LEFT JOIN companies c ON c.id = t.company_id LEFT JOIN departments d ON d.id = t.department_id`

export async function getTemplate(id: number): Promise<TemplateJoined | null> {
  const db = await getDb()
  return (await db.get<TemplateJoined>(`${SELECT} WHERE t.id = ?`, [id])) ?? null
}

export function parseDesign(row: TemplateRow): CardTemplateDoc {
  const parsed = validateTemplateDoc(JSON.parse(row.design_json))
  if (!parsed.ok) throw new HttpError(500, `Modelo corrompido: ${parsed.error}`)
  return parsed.doc
}

function serialize(t: TemplateJoined, withDesign: boolean) {
  return {
    id: t.id,
    name: t.name,
    companyId: t.company_id,
    companyName: t.company_name,
    departmentId: t.department_id,
    departmentName: t.department_name,
    orientation: t.orientation,
    doubleSided: Number(t.double_sided) === 1,
    thumbnail: t.thumbnail,
    source: t.source,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
    ...(withDesign ? { design: parseDesign(t) } : {}),
  }
}

const templateSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome do modelo.').max(200),
  companyId: z.number().int().positive().nullable().optional(),
  departmentId: z.number().int().positive().nullable().optional(),
  design: z.unknown().optional(),
  thumbnail: z.string().max(400_000).nullable().optional(),
  source: z.enum(['editor', 'import', 'builtin']).optional(),
})

async function checkRefs(companyId: number | null, departmentId: number | null): Promise<number | null> {
  if (companyId && !(await getCompany(companyId))) throw new HttpError(404, 'Empresa não encontrada.')
  if (departmentId) {
    const d = await getDepartment(departmentId)
    if (!d) throw new HttpError(404, 'Departamento não encontrado.')
    if (companyId && d.company_id !== companyId) throw new HttpError(400, 'O departamento não pertence à empresa informada.')
    return d.company_id
  }
  return companyId
}

const MAX_DESIGN_BYTES = 8 * 1024 * 1024
const MAX_OBJECTS_PER_SIDE = 500

/** Limites estruturais para desenhos vindos do cliente ou de arquivos importados. */
function checkDesignLimits(doc: CardTemplateDoc): void {
  const bytes = Buffer.byteLength(JSON.stringify(doc), 'utf8')
  if (bytes > MAX_DESIGN_BYTES) throw new HttpError(413, `O modelo é muito grande (${(bytes / 1024 / 1024).toFixed(1)} MB; máximo 8 MB). Reduza as imagens usadas no desenho.`)
  for (const side of [doc.front, doc.back]) {
    if (!side) continue
    const objects = side.fabric.objects as unknown[]
    if (objects.length > MAX_OBJECTS_PER_SIDE) throw new HttpError(400, `O modelo tem elementos demais (${objects.length}; máximo ${MAX_OBJECTS_PER_SIDE} por lado).`)
  }
}

function parseIncomingDesign(design: unknown, name: string): CardTemplateDoc {
  const withName = design && typeof design === 'object' ? { ...(design as Record<string, unknown>) } : design
  if (withName && typeof withName === 'object') {
    const o = withName as Record<string, unknown>
    if (!o.name) o.name = name
    if (!o.format) o.format = TEMPLATE_FORMAT
    if (o.version === undefined) o.version = TEMPLATE_VERSION
  }
  const parsed = validateTemplateDoc(withName)
  if (!parsed.ok) throw new HttpError(400, parsed.error)
  parsed.doc.name = name
  checkDesignLimits(parsed.doc)
  return parsed.doc
}

templatesRouter.get('/', async (req, res) => {
  const companyId = req.query.companyId ? Number(req.query.companyId) : null
  const db = await getDb()
  const rows = companyId
    ? await db.all<TemplateJoined>(`${SELECT} WHERE t.company_id = ? OR t.company_id IS NULL ORDER BY lower(t.name)`, [companyId])
    : await db.all<TemplateJoined>(`${SELECT} ORDER BY lower(t.name)`)
  res.json(rows.map((r) => serialize(r, false)))
})

/** Modelos prontos embutidos no sistema (para começar rapidamente). */
templatesRouter.get('/builtin', (_req, res) => {
  res.json(BUILTIN_TEMPLATES.map((t) => ({ key: t.key, name: t.name, description: t.description, orientation: t.doc.orientation })))
})

templatesRouter.post('/builtin/:key', async (req, res) => {
  const b = BUILTIN_TEMPLATES.find((t) => t.key === req.params.key)
  if (!b) throw new HttpError(404, 'Modelo embutido não encontrado.')
  const db = await getDb()
  const row = await db.get<{ id: number }>(
    'INSERT INTO templates (name, orientation, double_sided, design_json, source) VALUES (?, ?, ?, ?, ?) RETURNING id',
    [b.name, b.doc.orientation, b.doc.doubleSided ? 1 : 0, JSON.stringify(b.doc), 'builtin'],
  )
  res.status(201).json(serialize((await getTemplate(row!.id))!, true))
})

templatesRouter.get('/:id', async (req, res) => {
  const t = await getTemplate(parseId(req.params.id))
  if (!t) throw new HttpError(404, 'Modelo não encontrado.')
  res.json(serialize(t, true))
})

/** Exporta o modelo como arquivo .json (formato próprio, reimportável). */
templatesRouter.get('/:id/export', async (req, res) => {
  const t = await getTemplate(parseId(req.params.id))
  if (!t) throw new HttpError(404, 'Modelo não encontrado.')
  const doc = parseDesign(t)
  doc.meta = { ...(doc.meta ?? {}), exportedAt: new Date().toISOString(), app: 'Impress-o' }
  const safe = t.name.replace(/[^\w\-]+/g, '_').slice(0, 60) || 'modelo'
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${safe}.impresso.json"`)
  res.send(JSON.stringify(doc, null, 2))
})

templatesRouter.post('/', async (req, res) => {
  const body = validate(templateSchema, req.body)
  const companyId = await checkRefs(body.companyId ?? null, body.departmentId ?? null)
  const doc = body.design === undefined ? emptyTemplateDoc(body.name) : parseIncomingDesign(body.design, body.name)
  const db = await getDb()
  const row = await db.get<{ id: number }>(
    'INSERT INTO templates (name, company_id, department_id, orientation, double_sided, design_json, thumbnail, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
    [body.name, companyId, body.departmentId ?? null, doc.orientation, doc.doubleSided ? 1 : 0, JSON.stringify(doc), body.thumbnail ?? null, body.source ?? 'editor'],
  )
  res.status(201).json(serialize((await getTemplate(row!.id))!, true))
})

/** Importa um arquivo de modelo (.json no formato Impress-o). */
templatesRouter.post('/import', async (req, res) => {
  const body = validate(
    z.object({
      design: z.unknown(),
      name: z.string().trim().max(200).optional(),
      companyId: z.number().int().positive().nullable().optional(),
      departmentId: z.number().int().positive().nullable().optional(),
    }),
    req.body,
  )
  const parsed = validateTemplateDoc(body.design)
  if (!parsed.ok) throw new HttpError(400, `Não foi possível importar: ${parsed.error}`)
  checkDesignLimits(parsed.doc)
  const name = body.name || parsed.doc.name
  parsed.doc.name = name
  const companyId = await checkRefs(body.companyId ?? null, body.departmentId ?? null)
  const db = await getDb()
  const row = await db.get<{ id: number }>(
    'INSERT INTO templates (name, company_id, department_id, orientation, double_sided, design_json, source) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id',
    [name, companyId, body.departmentId ?? null, parsed.doc.orientation, parsed.doc.doubleSided ? 1 : 0, JSON.stringify(parsed.doc), 'import'],
  )
  res.status(201).json(serialize((await getTemplate(row!.id))!, true))
})

templatesRouter.put('/:id', async (req, res) => {
  const id = parseId(req.params.id)
  const existing = await getTemplate(id)
  if (!existing) throw new HttpError(404, 'Modelo não encontrado.')
  const body = validate(templateSchema.partial(), req.body)
  const name = body.name ?? existing.name
  const companyIdIn = body.companyId === undefined ? existing.company_id : body.companyId
  const departmentId = body.departmentId === undefined ? existing.department_id : body.departmentId
  const companyId = await checkRefs(companyIdIn, departmentId)
  const doc = body.design === undefined ? parseDesign(existing) : parseIncomingDesign(body.design, name)
  doc.name = name
  const db = await getDb()
  await db.run(
    'UPDATE templates SET name = ?, company_id = ?, department_id = ?, orientation = ?, double_sided = ?, design_json = ?, thumbnail = ?, updated_at = ? WHERE id = ?',
    [name, companyId, departmentId, doc.orientation, doc.doubleSided ? 1 : 0, JSON.stringify(doc), body.thumbnail === undefined ? existing.thumbnail : body.thumbnail, nowIso(), id],
  )
  res.json(serialize((await getTemplate(id))!, true))
})

templatesRouter.post('/:id/duplicate', async (req, res) => {
  const id = parseId(req.params.id)
  const existing = await getTemplate(id)
  if (!existing) throw new HttpError(404, 'Modelo não encontrado.')
  const doc = parseDesign(existing)
  doc.name = `${existing.name} (cópia)`
  const db = await getDb()
  const row = await db.get<{ id: number }>(
    'INSERT INTO templates (name, company_id, department_id, orientation, double_sided, design_json, thumbnail, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
    [doc.name, existing.company_id, existing.department_id, existing.orientation, Number(existing.double_sided), JSON.stringify(doc), existing.thumbnail, 'editor'],
  )
  res.status(201).json(serialize((await getTemplate(row!.id))!, true))
})

templatesRouter.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id)
  if (!(await getTemplate(id))) throw new HttpError(404, 'Modelo não encontrado.')
  const db = await getDb()
  await db.transaction(async (tx) => {
    await tx.run('UPDATE companies SET default_template_id = NULL WHERE default_template_id = ?', [id])
    await tx.run('UPDATE departments SET default_template_id = NULL WHERE default_template_id = ?', [id])
    await tx.run('DELETE FROM templates WHERE id = ?', [id])
  })
  res.json({ ok: true })
})

/**
 * Resolve qual modelo se aplica a uma pessoa:
 *  1. modelo escolhido na própria pessoa
 *  2. modelo padrão do departamento
 *  3. modelo padrão da empresa
 *  4. modelo vinculado ao departamento / à empresa
 *  5. primeiro modelo cadastrado
 */
export async function resolveTemplateForPerson(personId: number): Promise<TemplateJoined | null> {
  const p = await getPerson(personId)
  if (!p) return null
  const db = await getDb()
  const candidates: (number | null | undefined)[] = [p.template_id]
  if (p.department_id) candidates.push((await getDepartment(p.department_id))?.default_template_id)
  if (p.company_id) candidates.push((await getCompany(p.company_id))?.default_template_id)
  for (const id of candidates) {
    if (id) {
      const t = await getTemplate(id)
      if (t) return t
    }
  }
  if (p.department_id) {
    const t = await db.get<TemplateJoined>(`${SELECT} WHERE t.department_id = ? ORDER BY t.updated_at DESC LIMIT 1`, [p.department_id])
    if (t) return t
  }
  if (p.company_id) {
    const t = await db.get<TemplateJoined>(`${SELECT} WHERE t.company_id = ? AND t.department_id IS NULL ORDER BY t.updated_at DESC LIMIT 1`, [p.company_id])
    if (t) return t
  }
  const any = await db.get<TemplateJoined>(`${SELECT} ORDER BY t.id LIMIT 1`)
  return any ?? null
}

templatesRouter.get('/resolve/:personId', async (req, res) => {
  const t = await resolveTemplateForPerson(parseId(req.params.personId))
  if (!t) {
    res.json(null)
    return
  }
  res.json(serialize(t, true))
})
