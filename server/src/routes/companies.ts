import { Router } from 'express'
import { z } from 'zod'
import { getDb, nowIso } from '../lib/db.js'
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

function serializeDepartment(d: DepartmentRow & { persons_count?: number; company_name?: string | null }) {
  return {
    id: d.id,
    companyId: d.company_id,
    companyName: d.company_name ?? null,
    name: d.name,
    color: d.color,
    defaultTemplateId: d.default_template_id,
    personsCount: Number(d.persons_count ?? 0),
    createdAt: d.created_at,
    updatedAt: d.updated_at,
  }
}

export async function getCompany(id: number): Promise<CompanyRow | null> {
  const db = await getDb()
  return (await db.get<CompanyRow>('SELECT * FROM companies WHERE id = ?', [id])) ?? null
}
export async function getDepartment(id: number): Promise<DepartmentRow | null> {
  const db = await getDb()
  return (await db.get<DepartmentRow>('SELECT * FROM departments WHERE id = ?', [id])) ?? null
}

const companySchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome da empresa.').max(200),
  cnpj: z.string().trim().max(30).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  defaultTemplateId: z.number().int().positive().nullable().optional(),
  /** data URL de um novo logo; null remove o logo */
  logoDataUrl: z.string().nullable().optional(),
})

companiesRouter.get('/', async (_req, res) => {
  const db = await getDb()
  const rows = await db.all<CompanyRow & { departments: number; persons: number }>(
    `SELECT c.*,
      (SELECT COUNT(*) FROM departments d WHERE d.company_id = c.id) AS departments,
      (SELECT COUNT(*) FROM persons p WHERE p.company_id = c.id) AS persons
     FROM companies c ORDER BY lower(c.name)`,
  )
  res.json(rows.map((r) => serializeCompany(r, { departments: Number(r.departments), persons: Number(r.persons) })))
})

companiesRouter.get('/:id', async (req, res) => {
  const c = await getCompany(parseId(req.params.id))
  if (!c) throw new HttpError(404, 'Empresa não encontrada.')
  const db = await getDb()
  const departments = await db.all<DepartmentRow & { persons_count: number }>(
    'SELECT d.*, (SELECT COUNT(*) FROM persons p WHERE p.department_id = d.id) AS persons_count FROM departments d WHERE d.company_id = ? ORDER BY lower(d.name)',
    [c.id],
  )
  res.json({ ...serializeCompany(c), departments: departments.map(serializeDepartment) })
})

companiesRouter.post('/', async (req, res) => {
  const body = validate(companySchema, req.body)
  const db = await getDb()
  const logoId = body.logoDataUrl ? (await saveAsset('logo', body.logoDataUrl)).id : null
  const row = await db.get<{ id: number }>(
    'INSERT INTO companies (name, cnpj, notes, default_template_id, logo_asset_id) VALUES (?, ?, ?, ?, ?) RETURNING id',
    [body.name, body.cnpj ?? null, body.notes ?? null, body.defaultTemplateId ?? null, logoId],
  )
  res.status(201).json(serializeCompany((await getCompany(row!.id))!))
})

companiesRouter.put('/:id', async (req, res) => {
  const id = parseId(req.params.id)
  const existing = await getCompany(id)
  if (!existing) throw new HttpError(404, 'Empresa não encontrada.')
  const body = validate(companySchema.partial(), req.body)
  let logoId = existing.logo_asset_id
  if (body.logoDataUrl === null) logoId = null
  else if (typeof body.logoDataUrl === 'string') logoId = (await saveAsset('logo', body.logoDataUrl)).id
  const db = await getDb()
  await db.run(
    'UPDATE companies SET name = ?, cnpj = ?, notes = ?, default_template_id = ?, logo_asset_id = ?, updated_at = ? WHERE id = ?',
    [
      body.name ?? existing.name,
      body.cnpj === undefined ? existing.cnpj : body.cnpj,
      body.notes === undefined ? existing.notes : body.notes,
      body.defaultTemplateId === undefined ? existing.default_template_id : body.defaultTemplateId,
      logoId,
      nowIso(),
      id,
    ],
  )
  res.json(serializeCompany((await getCompany(id))!))
})

companiesRouter.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id)
  if (!(await getCompany(id))) throw new HttpError(404, 'Empresa não encontrada.')
  const db = await getDb()
  await db.run('DELETE FROM companies WHERE id = ?', [id])
  res.json({ ok: true })
})

/* ---------------------------- Departamentos ---------------------------- */

const departmentSchema = z.object({
  companyId: z.number().int().positive(),
  name: z.string().trim().min(1, 'Informe o nome do departamento.').max(200),
  color: z.string().trim().max(20).nullable().optional(),
  defaultTemplateId: z.number().int().positive().nullable().optional(),
})

departmentsRouter.get('/', async (req, res) => {
  const companyId = req.query.companyId ? Number(req.query.companyId) : null
  const db = await getDb()
  const where = companyId ? 'WHERE d.company_id = ?' : ''
  const rows = await db.all<DepartmentRow & { persons_count: number; company_name: string }>(
    `SELECT d.*, c.name AS company_name,
      (SELECT COUNT(*) FROM persons p WHERE p.department_id = d.id) AS persons_count
     FROM departments d JOIN companies c ON c.id = d.company_id
     ${where}
     ORDER BY lower(c.name), lower(d.name)`,
    companyId ? [companyId] : [],
  )
  res.json(rows.map(serializeDepartment))
})

departmentsRouter.post('/', async (req, res) => {
  const body = validate(departmentSchema, req.body)
  if (!(await getCompany(body.companyId))) throw new HttpError(404, 'Empresa não encontrada.')
  const db = await getDb()
  const dup = await db.get('SELECT id FROM departments WHERE company_id = ? AND lower(name) = lower(?)', [body.companyId, body.name])
  if (dup) throw new HttpError(409, 'Já existe um departamento com esse nome nesta empresa.')
  const row = await db.get<{ id: number }>(
    'INSERT INTO departments (company_id, name, color, default_template_id) VALUES (?, ?, ?, ?) RETURNING id',
    [body.companyId, body.name, body.color ?? null, body.defaultTemplateId ?? null],
  )
  res.status(201).json(serializeDepartment((await getDepartment(row!.id))!))
})

departmentsRouter.put('/:id', async (req, res) => {
  const id = parseId(req.params.id)
  const existing = await getDepartment(id)
  if (!existing) throw new HttpError(404, 'Departamento não encontrado.')
  const body = validate(departmentSchema.partial(), req.body)
  const companyId = body.companyId ?? existing.company_id
  if (!(await getCompany(companyId))) throw new HttpError(404, 'Empresa não encontrada.')
  const name = body.name ?? existing.name
  const db = await getDb()
  const dup = await db.get('SELECT id FROM departments WHERE company_id = ? AND lower(name) = lower(?) AND id != ?', [companyId, name, id])
  if (dup) throw new HttpError(409, 'Já existe um departamento com esse nome nesta empresa.')
  await db.transaction(async (tx) => {
    await tx.run('UPDATE departments SET company_id = ?, name = ?, color = ?, default_template_id = ?, updated_at = ? WHERE id = ?', [
      companyId,
      name,
      body.color === undefined ? existing.color : body.color,
      body.defaultTemplateId === undefined ? existing.default_template_id : body.defaultTemplateId,
      nowIso(),
      id,
    ])
    if (companyId !== existing.company_id) {
      // Pessoas e modelos do departamento acompanham a mudança de empresa
      await tx.run('UPDATE persons SET company_id = ?, updated_at = ? WHERE department_id = ?', [companyId, nowIso(), id])
      await tx.run('UPDATE templates SET company_id = ?, updated_at = ? WHERE department_id = ?', [companyId, nowIso(), id])
    }
  })
  res.json(serializeDepartment((await getDepartment(id))!))
})

departmentsRouter.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id)
  if (!(await getDepartment(id))) throw new HttpError(404, 'Departamento não encontrado.')
  const db = await getDb()
  await db.run('DELETE FROM departments WHERE id = ?', [id])
  res.json({ ok: true })
})
