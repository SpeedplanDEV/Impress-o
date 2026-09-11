import { Router } from 'express'
import { z } from 'zod'
import { getDb } from '../lib/db.js'
import { HttpError, parseId, validate } from '../lib/http.js'
import { assetUrl, saveAsset } from '../lib/assets.js'

export const companiesRouter = Router()
export const departmentsRouter = Router()

export interface CompanyRow {
  id: number
  name: string
  cnpj: string | null
  logo_asset_id: number | null
  default_template_id: number | null
  notes: string | null
  created_at: string
  updated_at: string
}
export interface DepartmentRow {
  id: number
  company_id: number
  name: string
  color: string | null
  default_template_id: number | null
  created_at: string
  updated_at: string
}

function serializeCompany(c: CompanyRow, counts?: { departments: number; persons: number }) {
  return {
    id: c.id,
    name: c.name,
    cnpj: c.cnpj,
    logoAssetId: c.logo_asset_id,
    logoUrl: assetUrl(c.logo_asset_id),
    defaultTemplateId: c.default_template_id,
    notes: c.notes,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    departmentsCount: counts?.departments ?? 0,
    personsCount: counts?.persons ?? 0,
  }
}

function serializeDepartment(d: DepartmentRow & { persons_count?: number; company_name?: string }) {
  return {
    id: d.id,
    companyId: d.company_id,
    companyName: d.company_name ?? null,
    name: d.name,
    color: d.color,
    defaultTemplateId: d.default_template_id,
    personsCount: d.persons_count ?? 0,
    createdAt: d.created_at,
    updatedAt: d.updated_at,
  }
}

export function getCompany(id: number): CompanyRow | null {
  return (getDb().prepare('SELECT * FROM companies WHERE id = ?').get(id) as unknown as CompanyRow | undefined) ?? null
}
export function getDepartment(id: number): DepartmentRow | null {
  return (getDb().prepare('SELECT * FROM departments WHERE id = ?').get(id) as unknown as DepartmentRow | undefined) ?? null
}

const companySchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome da empresa.').max(200),
  cnpj: z.string().trim().max(30).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  defaultTemplateId: z.number().int().positive().nullable().optional(),
  /** data URL de um novo logo; null remove o logo */
  logoDataUrl: z.string().nullable().optional(),
})

companiesRouter.get('/', (_req, res) => {
  const rows = getDb()
    .prepare(
      `SELECT c.*,
        (SELECT COUNT(*) FROM departments d WHERE d.company_id = c.id) AS departments,
        (SELECT COUNT(*) FROM persons p WHERE p.company_id = c.id) AS persons
       FROM companies c ORDER BY c.name COLLATE NOCASE`,
    )
    .all() as unknown as (CompanyRow & { departments: number; persons: number })[]
  res.json(rows.map((r) => serializeCompany(r, { departments: r.departments, persons: r.persons })))
})

companiesRouter.get('/:id', (req, res) => {
  const c = getCompany(parseId(req.params.id))
  if (!c) throw new HttpError(404, 'Empresa não encontrada.')
  const departments = getDb()
    .prepare('SELECT d.*, (SELECT COUNT(*) FROM persons p WHERE p.department_id = d.id) AS persons_count FROM departments d WHERE d.company_id = ? ORDER BY d.name COLLATE NOCASE')
    .all(c.id) as unknown as (DepartmentRow & { persons_count: number })[]
  res.json({ ...serializeCompany(c), departments: departments.map(serializeDepartment) })
})

companiesRouter.post('/', (req, res) => {
  const body = validate(companySchema, req.body)
  const db = getDb()
  const logoId = body.logoDataUrl ? saveAsset('logo', body.logoDataUrl).id : null
  const info = db
    .prepare('INSERT INTO companies (name, cnpj, notes, default_template_id, logo_asset_id) VALUES (?, ?, ?, ?, ?)')
    .run(body.name, body.cnpj ?? null, body.notes ?? null, body.defaultTemplateId ?? null, logoId)
  res.status(201).json(serializeCompany(getCompany(Number(info.lastInsertRowid))!))
})

companiesRouter.put('/:id', (req, res) => {
  const id = parseId(req.params.id)
  const existing = getCompany(id)
  if (!existing) throw new HttpError(404, 'Empresa não encontrada.')
  const body = validate(companySchema.partial(), req.body)
  let logoId = existing.logo_asset_id
  if (body.logoDataUrl === null) logoId = null
  else if (typeof body.logoDataUrl === 'string') logoId = saveAsset('logo', body.logoDataUrl).id
  getDb()
    .prepare(
      `UPDATE companies SET name = ?, cnpj = ?, notes = ?, default_template_id = ?, logo_asset_id = ?, updated_at = datetime('now') WHERE id = ?`,
    )
    .run(
      body.name ?? existing.name,
      body.cnpj === undefined ? existing.cnpj : body.cnpj,
      body.notes === undefined ? existing.notes : body.notes,
      body.defaultTemplateId === undefined ? existing.default_template_id : body.defaultTemplateId,
      logoId,
      id,
    )
  res.json(serializeCompany(getCompany(id)!))
})

companiesRouter.delete('/:id', (req, res) => {
  const id = parseId(req.params.id)
  if (!getCompany(id)) throw new HttpError(404, 'Empresa não encontrada.')
  getDb().prepare('DELETE FROM companies WHERE id = ?').run(id)
  res.json({ ok: true })
})

/* ---------------------------- Departamentos ---------------------------- */

const departmentSchema = z.object({
  companyId: z.number().int().positive(),
  name: z.string().trim().min(1, 'Informe o nome do departamento.').max(200),
  color: z.string().trim().max(20).nullable().optional(),
  defaultTemplateId: z.number().int().positive().nullable().optional(),
})

departmentsRouter.get('/', (req, res) => {
  const companyId = req.query.companyId ? Number(req.query.companyId) : null
  const rows = getDb()
    .prepare(
      `SELECT d.*, c.name AS company_name,
        (SELECT COUNT(*) FROM persons p WHERE p.department_id = d.id) AS persons_count
       FROM departments d JOIN companies c ON c.id = d.company_id
       WHERE (? IS NULL OR d.company_id = ?)
       ORDER BY c.name COLLATE NOCASE, d.name COLLATE NOCASE`,
    )
    .all(companyId, companyId) as unknown as (DepartmentRow & { persons_count: number; company_name: string })[]
  res.json(rows.map(serializeDepartment))
})

departmentsRouter.post('/', (req, res) => {
  const body = validate(departmentSchema, req.body)
  if (!getCompany(body.companyId)) throw new HttpError(404, 'Empresa não encontrada.')
  const db = getDb()
  const dup = db.prepare('SELECT id FROM departments WHERE company_id = ? AND name = ? COLLATE NOCASE').get(body.companyId, body.name)
  if (dup) throw new HttpError(409, 'Já existe um departamento com esse nome nesta empresa.')
  const info = db
    .prepare('INSERT INTO departments (company_id, name, color, default_template_id) VALUES (?, ?, ?, ?)')
    .run(body.companyId, body.name, body.color ?? null, body.defaultTemplateId ?? null)
  res.status(201).json(serializeDepartment(getDepartment(Number(info.lastInsertRowid))!))
})

departmentsRouter.put('/:id', (req, res) => {
  const id = parseId(req.params.id)
  const existing = getDepartment(id)
  if (!existing) throw new HttpError(404, 'Departamento não encontrado.')
  const body = validate(departmentSchema.partial(), req.body)
  const companyId = body.companyId ?? existing.company_id
  if (!getCompany(companyId)) throw new HttpError(404, 'Empresa não encontrada.')
  const name = body.name ?? existing.name
  const dup = getDb().prepare('SELECT id FROM departments WHERE company_id = ? AND name = ? COLLATE NOCASE AND id != ?').get(companyId, name, id)
  if (dup) throw new HttpError(409, 'Já existe um departamento com esse nome nesta empresa.')
  getDb()
    .prepare(`UPDATE departments SET company_id = ?, name = ?, color = ?, default_template_id = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(
      companyId,
      name,
      body.color === undefined ? existing.color : body.color,
      body.defaultTemplateId === undefined ? existing.default_template_id : body.defaultTemplateId,
      id,
    )
  res.json(serializeDepartment(getDepartment(id)!))
})

departmentsRouter.delete('/:id', (req, res) => {
  const id = parseId(req.params.id)
  if (!getDepartment(id)) throw new HttpError(404, 'Departamento não encontrado.')
  getDb().prepare('DELETE FROM departments WHERE id = ?').run(id)
  res.json({ ok: true })
})
