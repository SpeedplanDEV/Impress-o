import { Router } from 'express'
import { z } from 'zod'
import { getDb } from '../lib/db.js'
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

export function getTemplate(id: number): TemplateJoined | null {
  return (getDb().prepare(`${SELECT} WHERE t.id = ?`).get(id) as unknown as TemplateJoined | undefined) ?? null
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
    doubleSided: t.double_sided === 1,
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

function checkRefs(companyId: number | null, departmentId: number | null): number | null {
  if (companyId && !getCompany(companyId)) throw new HttpError(404, 'Empresa não encontrada.')
  if (departmentId) {
    const d = getDepartment(departmentId)
    if (!d) throw new HttpError(404, 'Departamento não encontrado.')
    if (companyId && d.company_id !== companyId) throw new HttpError(400, 'O departamento não pertence à empresa informada.')
    return d.company_id
  }
  return companyId
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
  return parsed.doc
}

templatesRouter.get('/', (req, res) => {
  const companyId = req.query.companyId ? Number(req.query.companyId) : null
  const rows = getDb()
    .prepare(`${SELECT} WHERE (? IS NULL OR t.company_id = ? OR t.company_id IS NULL) ORDER BY t.name COLLATE NOCASE`)
    .all(companyId, companyId) as unknown as TemplateJoined[]
  res.json(rows.map((r) => serialize(r, false)))
})

/** Modelos prontos embutidos no sistema (para começar rapidamente). */
templatesRouter.get('/builtin', (_req, res) => {
  res.json(BUILTIN_TEMPLATES.map((t) => ({ key: t.key, name: t.name, description: t.description, orientation: t.doc.orientation })))
})

templatesRouter.post('/builtin/:key', (req, res) => {
  const b = BUILTIN_TEMPLATES.find((t) => t.key === req.params.key)
  if (!b) throw new HttpError(404, 'Modelo embutido não encontrado.')
  const info = getDb()
    .prepare('INSERT INTO templates (name, orientation, double_sided, design_json, source) VALUES (?, ?, ?, ?, ?)')
    .run(b.name, b.doc.orientation, b.doc.doubleSided ? 1 : 0, JSON.stringify(b.doc), 'builtin')
  res.status(201).json(serialize(getTemplate(Number(info.lastInsertRowid))!, true))
})

templatesRouter.get('/:id', (req, res) => {
  const t = getTemplate(parseId(req.params.id))
  if (!t) throw new HttpError(404, 'Modelo não encontrado.')
  res.json(serialize(t, true))
})

/** Exporta o modelo como arquivo .json (formato próprio, reimportável). */
templatesRouter.get('/:id/export', (req, res) => {
  const t = getTemplate(parseId(req.params.id))
  if (!t) throw new HttpError(404, 'Modelo não encontrado.')
  const doc = parseDesign(t)
  doc.meta = { ...(doc.meta ?? {}), exportedAt: new Date().toISOString(), app: 'Impress-o' }
  const safe = t.name.replace(/[^\w\-]+/g, '_').slice(0, 60) || 'modelo'
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${safe}.impresso.json"`)
  res.send(JSON.stringify(doc, null, 2))
})

templatesRouter.post('/', (req, res) => {
  const body = validate(templateSchema, req.body)
  const companyId = checkRefs(body.companyId ?? null, body.departmentId ?? null)
  const doc = body.design === undefined ? emptyTemplateDoc(body.name) : parseIncomingDesign(body.design, body.name)
  const info = getDb()
    .prepare('INSERT INTO templates (name, company_id, department_id, orientation, double_sided, design_json, thumbnail, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(body.name, companyId, body.departmentId ?? null, doc.orientation, doc.doubleSided ? 1 : 0, JSON.stringify(doc), body.thumbnail ?? null, body.source ?? 'editor')
  res.status(201).json(serialize(getTemplate(Number(info.lastInsertRowid))!, true))
})

/** Importa um arquivo de modelo (.json no formato Impress-o). */
templatesRouter.post('/import', (req, res) => {
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
  const name = body.name || parsed.doc.name
  parsed.doc.name = name
  const companyId = checkRefs(body.companyId ?? null, body.departmentId ?? null)
  const info = getDb()
    .prepare('INSERT INTO templates (name, company_id, department_id, orientation, double_sided, design_json, source) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(name, companyId, body.departmentId ?? null, parsed.doc.orientation, parsed.doc.doubleSided ? 1 : 0, JSON.stringify(parsed.doc), 'import')
  res.status(201).json(serialize(getTemplate(Number(info.lastInsertRowid))!, true))
})

templatesRouter.put('/:id', (req, res) => {
  const id = parseId(req.params.id)
  const existing = getTemplate(id)
  if (!existing) throw new HttpError(404, 'Modelo não encontrado.')
  const body = validate(templateSchema.partial(), req.body)
  const name = body.name ?? existing.name
  const companyIdIn = body.companyId === undefined ? existing.company_id : body.companyId
  const departmentId = body.departmentId === undefined ? existing.department_id : body.departmentId
  const companyId = checkRefs(companyIdIn, departmentId)
  const doc = body.design === undefined ? parseDesign(existing) : parseIncomingDesign(body.design, name)
  doc.name = name
  getDb()
    .prepare(
      `UPDATE templates SET name = ?, company_id = ?, department_id = ?, orientation = ?, double_sided = ?, design_json = ?, thumbnail = ?, updated_at = datetime('now') WHERE id = ?`,
    )
    .run(name, companyId, departmentId, doc.orientation, doc.doubleSided ? 1 : 0, JSON.stringify(doc), body.thumbnail === undefined ? existing.thumbnail : body.thumbnail, id)
  res.json(serialize(getTemplate(id)!, true))
})

templatesRouter.post('/:id/duplicate', (req, res) => {
  const id = parseId(req.params.id)
  const existing = getTemplate(id)
  if (!existing) throw new HttpError(404, 'Modelo não encontrado.')
  const doc = parseDesign(existing)
  doc.name = `${existing.name} (cópia)`
  const info = getDb()
    .prepare('INSERT INTO templates (name, company_id, department_id, orientation, double_sided, design_json, thumbnail, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(doc.name, existing.company_id, existing.department_id, existing.orientation, existing.double_sided, JSON.stringify(doc), existing.thumbnail, 'editor')
  res.status(201).json(serialize(getTemplate(Number(info.lastInsertRowid))!, true))
})

templatesRouter.delete('/:id', (req, res) => {
  const id = parseId(req.params.id)
  if (!getTemplate(id)) throw new HttpError(404, 'Modelo não encontrado.')
  const db = getDb()
  db.prepare('UPDATE companies SET default_template_id = NULL WHERE default_template_id = ?').run(id)
  db.prepare('UPDATE departments SET default_template_id = NULL WHERE default_template_id = ?').run(id)
  db.prepare('DELETE FROM templates WHERE id = ?').run(id)
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
export function resolveTemplateForPerson(personId: number): TemplateJoined | null {
  const p = getPerson(personId)
  if (!p) return null
  const db = getDb()
  const candidates: (number | null | undefined)[] = [p.template_id]
  if (p.department_id) candidates.push(getDepartment(p.department_id)?.default_template_id)
  if (p.company_id) candidates.push(getCompany(p.company_id)?.default_template_id)
  for (const id of candidates) {
    if (id) {
      const t = getTemplate(id)
      if (t) return t
    }
  }
  if (p.department_id) {
    const t = db.prepare(`${SELECT} WHERE t.department_id = ? ORDER BY t.updated_at DESC LIMIT 1`).get(p.department_id) as unknown as TemplateJoined | undefined
    if (t) return t
  }
  if (p.company_id) {
    const t = db.prepare(`${SELECT} WHERE t.company_id = ? AND t.department_id IS NULL ORDER BY t.updated_at DESC LIMIT 1`).get(p.company_id) as unknown as TemplateJoined | undefined
    if (t) return t
  }
  const any = db.prepare(`${SELECT} ORDER BY t.id LIMIT 1`).get() as unknown as TemplateJoined | undefined
  return any ?? null
}

templatesRouter.get('/resolve/:personId', (req, res) => {
  const t = resolveTemplateForPerson(parseId(req.params.personId))
  if (!t) {
    res.json(null)
    return
  }
  res.json(serialize(t, true))
})
