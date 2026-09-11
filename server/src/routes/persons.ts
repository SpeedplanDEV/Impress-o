import { Router } from 'express'
import { z } from 'zod'
import { getDb } from '../lib/db.js'
import { HttpError, parseId, validate } from '../lib/http.js'
import { assetUrl, saveAsset } from '../lib/assets.js'
import { getCompany, getDepartment } from './companies.js'
import { parseCsv } from '../lib/csv.js'

export const personsRouter = Router()

export interface PersonRow {
  id: number
  company_id: number | null
  department_id: number | null
  full_name: string
  display_name: string | null
  role_title: string | null
  registration: string | null
  document: string | null
  email: string | null
  phone: string | null
  valid_until: string | null
  photo_asset_id: number | null
  extra_json: string
  template_id: number | null
  active: number
  created_at: string
  updated_at: string
}

export interface PersonJoined extends PersonRow {
  company_name: string | null
  department_name: string | null
  template_name: string | null
}

export function serializePerson(p: PersonJoined) {
  let extra: Record<string, string> = {}
  try {
    extra = JSON.parse(p.extra_json || '{}')
  } catch {
    extra = {}
  }
  return {
    id: p.id,
    companyId: p.company_id,
    companyName: p.company_name,
    departmentId: p.department_id,
    departmentName: p.department_name,
    fullName: p.full_name,
    displayName: p.display_name,
    roleTitle: p.role_title,
    registration: p.registration,
    document: p.document,
    email: p.email,
    phone: p.phone,
    validUntil: p.valid_until,
    photoAssetId: p.photo_asset_id,
    photoUrl: assetUrl(p.photo_asset_id),
    extra,
    templateId: p.template_id,
    templateName: p.template_name,
    active: p.active === 1,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  }
}

const SELECT_PERSON = `
  SELECT p.*, c.name AS company_name, d.name AS department_name, t.name AS template_name
  FROM persons p
  LEFT JOIN companies c ON c.id = p.company_id
  LEFT JOIN departments d ON d.id = p.department_id
  LEFT JOIN templates t ON t.id = p.template_id`

export function getPerson(id: number): PersonJoined | null {
  return (getDb().prepare(`${SELECT_PERSON} WHERE p.id = ?`).get(id) as unknown as PersonJoined | undefined) ?? null
}

const personSchema = z.object({
  companyId: z.number().int().positive().nullable().optional(),
  departmentId: z.number().int().positive().nullable().optional(),
  fullName: z.string().trim().min(1, 'Informe o nome.').max(200),
  displayName: z.string().trim().max(200).nullable().optional(),
  roleTitle: z.string().trim().max(200).nullable().optional(),
  registration: z.string().trim().max(100).nullable().optional(),
  document: z.string().trim().max(50).nullable().optional(),
  email: z.string().trim().max(200).nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  validUntil: z.string().trim().max(10).nullable().optional(),
  extra: z.record(z.string(), z.string()).optional(),
  templateId: z.number().int().positive().nullable().optional(),
  active: z.boolean().optional(),
  /** data URL da foto 3x4 já recortada; null remove */
  photoDataUrl: z.string().nullable().optional(),
})

function checkRefs(companyId: number | null, departmentId: number | null): void {
  if (companyId && !getCompany(companyId)) throw new HttpError(404, 'Empresa não encontrada.')
  if (departmentId) {
    const d = getDepartment(departmentId)
    if (!d) throw new HttpError(404, 'Departamento não encontrado.')
    if (companyId && d.company_id !== companyId) throw new HttpError(400, 'O departamento não pertence à empresa informada.')
  }
}

personsRouter.get('/', (req, res) => {
  const q = typeof req.query.q === 'string' ? `%${req.query.q.trim()}%` : null
  const companyId = req.query.companyId ? Number(req.query.companyId) : null
  const departmentId = req.query.departmentId ? Number(req.query.departmentId) : null
  const onlyActive = req.query.active === '1' || req.query.active === 'true'
  const rows = getDb()
    .prepare(
      `${SELECT_PERSON}
       WHERE (? IS NULL OR p.full_name LIKE ? OR p.registration LIKE ? OR p.role_title LIKE ?)
         AND (? IS NULL OR p.company_id = ?)
         AND (? IS NULL OR p.department_id = ?)
         AND (? = 0 OR p.active = 1)
       ORDER BY p.full_name COLLATE NOCASE`,
    )
    .all(q, q, q, q, companyId, companyId, departmentId, departmentId, onlyActive ? 1 : 0) as unknown as PersonJoined[]
  res.json(rows.map(serializePerson))
})

personsRouter.get('/:id', (req, res) => {
  const p = getPerson(parseId(req.params.id))
  if (!p) throw new HttpError(404, 'Pessoa não encontrada.')
  res.json(serializePerson(p))
})

personsRouter.post('/', (req, res) => {
  const body = validate(personSchema, req.body)
  const companyId = body.companyId ?? (body.departmentId ? getDepartment(body.departmentId)?.company_id ?? null : null)
  checkRefs(companyId, body.departmentId ?? null)
  const photoId = body.photoDataUrl ? saveAsset('photo', body.photoDataUrl).id : null
  const info = getDb()
    .prepare(
      `INSERT INTO persons (company_id, department_id, full_name, display_name, role_title, registration, document, email, phone, valid_until, photo_asset_id, extra_json, template_id, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      companyId,
      body.departmentId ?? null,
      body.fullName,
      body.displayName ?? null,
      body.roleTitle ?? null,
      body.registration ?? null,
      body.document ?? null,
      body.email ?? null,
      body.phone ?? null,
      body.validUntil ?? null,
      photoId,
      JSON.stringify(body.extra ?? {}),
      body.templateId ?? null,
      body.active === false ? 0 : 1,
    )
  res.status(201).json(serializePerson(getPerson(Number(info.lastInsertRowid))!))
})

personsRouter.put('/:id', (req, res) => {
  const id = parseId(req.params.id)
  const existing = getPerson(id)
  if (!existing) throw new HttpError(404, 'Pessoa não encontrada.')
  const body = validate(personSchema.partial(), req.body)
  const companyId = body.companyId === undefined ? existing.company_id : body.companyId
  const departmentId = body.departmentId === undefined ? existing.department_id : body.departmentId
  checkRefs(companyId, departmentId)
  let photoId = existing.photo_asset_id
  if (body.photoDataUrl === null) photoId = null
  else if (typeof body.photoDataUrl === 'string') photoId = saveAsset('photo', body.photoDataUrl).id
  const pick = <T>(v: T | undefined, fallback: T): T => (v === undefined ? fallback : v)
  let extra: Record<string, string> = {}
  try {
    extra = JSON.parse(existing.extra_json || '{}')
  } catch {
    extra = {}
  }
  getDb()
    .prepare(
      `UPDATE persons SET company_id = ?, department_id = ?, full_name = ?, display_name = ?, role_title = ?, registration = ?, document = ?,
        email = ?, phone = ?, valid_until = ?, photo_asset_id = ?, extra_json = ?, template_id = ?, active = ?, updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(
      companyId,
      departmentId,
      body.fullName ?? existing.full_name,
      pick(body.displayName, existing.display_name),
      pick(body.roleTitle, existing.role_title),
      pick(body.registration, existing.registration),
      pick(body.document, existing.document),
      pick(body.email, existing.email),
      pick(body.phone, existing.phone),
      pick(body.validUntil, existing.valid_until),
      photoId,
      JSON.stringify(body.extra ?? extra),
      pick(body.templateId, existing.template_id),
      body.active === undefined ? existing.active : body.active ? 1 : 0,
      id,
    )
  res.json(serializePerson(getPerson(id)!))
})

personsRouter.delete('/:id', (req, res) => {
  const id = parseId(req.params.id)
  if (!getPerson(id)) throw new HttpError(404, 'Pessoa não encontrada.')
  getDb().prepare('DELETE FROM persons WHERE id = ?').run(id)
  res.json({ ok: true })
})

/* ------------------------- Importação em lote (CSV) ------------------------ */

const CSV_HEADERS: Record<string, keyof typeof CSV_MAP> = {}
const CSV_MAP = {
  full_name: ['nome', 'nome completo', 'nome_completo', 'full_name', 'fullname', 'name'],
  display_name: ['nome de exibição', 'nome de exibicao', 'apelido', 'display_name', 'displayname'],
  role_title: ['cargo', 'função', 'funcao', 'role', 'role_title', 'title'],
  registration: ['matrícula', 'matricula', 'registro', 'registration', 'id funcional'],
  document: ['documento', 'cpf', 'rg', 'document'],
  email: ['email', 'e-mail'],
  phone: ['telefone', 'celular', 'phone', 'fone'],
  valid_until: ['validade', 'válido até', 'valido ate', 'valid_until', 'vencimento'],
  department: ['departamento', 'setor', 'department', 'area', 'área'],
  company: ['empresa', 'company', 'organização', 'organizacao'],
}
for (const [field, names] of Object.entries(CSV_MAP)) for (const n of names) CSV_HEADERS[n] = field as keyof typeof CSV_MAP

const importSchema = z.object({
  csv: z.string().min(1, 'Arquivo vazio.'),
  companyId: z.number().int().positive().nullable().optional(),
  departmentId: z.number().int().positive().nullable().optional(),
  createDepartments: z.boolean().optional(),
})

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/^﻿/, '')
}

/** Converte datas dd/mm/aaaa em aaaa-mm-dd. */
function normalizeDate(v: string | undefined): string | null {
  if (!v) return null
  const s = v.trim()
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s)
  if (br) return `${br[3]}-${br[2]}-${br[1]}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return s
}

personsRouter.post('/import', (req, res) => {
  const body = validate(importSchema, req.body)
  const table = parseCsv(body.csv)
  if (table.length < 2) throw new HttpError(400, 'O CSV precisa de um cabeçalho e ao menos uma linha.')
  const header = table[0].map(normalizeHeader)
  const colIndex: Partial<Record<keyof typeof CSV_MAP, number>> = {}
  const extraCols: { name: string; index: number }[] = []
  header.forEach((h, i) => {
    const field = CSV_HEADERS[h]
    if (field && colIndex[field] === undefined) colIndex[field] = i
    else if (h) extraCols.push({ name: h, index: i })
  })
  if (colIndex.full_name === undefined) {
    throw new HttpError(400, 'Não encontrei a coluna "nome" no cabeçalho do CSV.')
  }

  const db = getDb()
  const defaultCompany = body.companyId ?? (body.departmentId ? getDepartment(body.departmentId)?.company_id ?? null : null)
  checkRefs(defaultCompany, body.departmentId ?? null)

  const insert = db.prepare(
    `INSERT INTO persons (company_id, department_id, full_name, display_name, role_title, registration, document, email, phone, valid_until, extra_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const errors: string[] = []
  let imported = 0
  let createdDepartments = 0
  db.exec('BEGIN')
  try {
    for (let r = 1; r < table.length; r++) {
      const row = table[r]
      if (row.every((c) => !c.trim())) continue
      const cell = (f: keyof typeof CSV_MAP) => (colIndex[f] === undefined ? undefined : row[colIndex[f]!]?.trim())
      const fullName = cell('full_name')
      if (!fullName) {
        errors.push(`Linha ${r + 1}: nome vazio.`)
        continue
      }
      let companyId = defaultCompany
      const companyName = cell('company')
      if (!companyId && companyName) {
        const c = db.prepare('SELECT id FROM companies WHERE name = ? COLLATE NOCASE').get(companyName) as unknown as { id: number } | undefined
        if (c) companyId = c.id
        else if (body.createDepartments) {
          companyId = Number(db.prepare('INSERT INTO companies (name) VALUES (?)').run(companyName).lastInsertRowid)
        }
      }
      let departmentId = body.departmentId ?? null
      const departmentName = cell('department')
      if (!departmentId && departmentName && companyId) {
        const d = db.prepare('SELECT id FROM departments WHERE company_id = ? AND name = ? COLLATE NOCASE').get(companyId, departmentName) as unknown as { id: number } | undefined
        if (d) departmentId = d.id
        else if (body.createDepartments) {
          departmentId = Number(db.prepare('INSERT INTO departments (company_id, name) VALUES (?, ?)').run(companyId, departmentName).lastInsertRowid)
          createdDepartments++
        }
      }
      const extra: Record<string, string> = {}
      for (const ec of extraCols) {
        const v = row[ec.index]?.trim()
        if (v) extra[ec.name] = v
      }
      insert.run(
        companyId,
        departmentId,
        fullName,
        cell('display_name') || null,
        cell('role_title') || null,
        cell('registration') || null,
        cell('document') || null,
        cell('email') || null,
        cell('phone') || null,
        normalizeDate(cell('valid_until')),
        JSON.stringify(extra),
      )
      imported++
    }
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
  res.json({ imported, createdDepartments, errors, extraColumns: extraCols.map((c) => c.name) })
})
