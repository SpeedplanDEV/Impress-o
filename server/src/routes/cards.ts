import { Router } from 'express'
import { getDb } from '../lib/db.js'
import { HttpError, parseId } from '../lib/http.js'
import { assetToDataUrl } from '../lib/assets.js'
import { getPerson, type PersonJoined } from './persons.js'
import { getCompany, getDepartment } from './companies.js'
import type { CardData } from '../../../shared/template.js'

export const cardsRouter = Router()

/** Monta os dados que preenchem os placeholders de um modelo para uma pessoa. */
export function buildCardData(p: PersonJoined, opts: { inlineImages: boolean }): CardData {
  const company = p.company_id ? getCompany(p.company_id) : null
  const department = p.department_id ? getDepartment(p.department_id) : null
  let extra: Record<string, string> = {}
  try {
    extra = JSON.parse(p.extra_json || '{}')
  } catch {
    extra = {}
  }
  const fmtDate = (iso: string | null) => {
    if (!iso) return ''
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
    return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
  }
  const today = new Date()
  const issue = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`
  const fields: CardData['fields'] = {
    ...extra,
    full_name: p.full_name,
    display_name: p.display_name || p.full_name,
    role_title: p.role_title ?? '',
    registration: p.registration ?? '',
    document: p.document ?? '',
    email: p.email ?? '',
    phone: p.phone ?? '',
    valid_until: fmtDate(p.valid_until),
    department: department?.name ?? p.department_name ?? '',
    company: company?.name ?? p.company_name ?? '',
    company_cnpj: company?.cnpj ?? '',
    card_number: String(p.id).padStart(6, '0'),
    issue_date: issue,
  }
  const photoUrl = opts.inlineImages ? assetToDataUrl(p.photo_asset_id) : p.photo_asset_id ? `/api/assets/${p.photo_asset_id}` : null
  const logoUrl = opts.inlineImages ? assetToDataUrl(company?.logo_asset_id) : company?.logo_asset_id ? `/api/assets/${company.logo_asset_id}` : null
  return { fields, photoUrl, logoUrl }
}

/** Dados de preenchimento para uma pessoa (imagens como data URL para render offline no canvas). */
cardsRouter.get('/data/:personId', (req, res) => {
  const p = getPerson(parseId(req.params.personId))
  if (!p) throw new HttpError(404, 'Pessoa não encontrada.')
  res.json(buildCardData(p, { inlineImages: req.query.inline !== '0' }))
})

/** Dados de exemplo para pré-visualizar um modelo sem pessoa. */
cardsRouter.get('/sample', (_req, res) => {
  const company = getDb().prepare('SELECT * FROM companies ORDER BY id LIMIT 1').get() as unknown as { name: string; cnpj: string | null; logo_asset_id: number | null } | undefined
  const data: CardData = {
    fields: {
      full_name: 'Maria Aparecida da Silva',
      display_name: 'Maria Silva',
      role_title: 'Analista de Sistemas',
      registration: '000123',
      document: '123.456.789-00',
      email: 'maria.silva@empresa.com.br',
      phone: '(11) 99999-0000',
      valid_until: '31/12/2027',
      department: 'Tecnologia da Informação',
      company: company?.name ?? 'Empresa Exemplo Ltda.',
      company_cnpj: company?.cnpj ?? '00.000.000/0001-00',
      card_number: '000001',
      issue_date: new Date().toLocaleDateString('pt-BR'),
    },
    photoUrl: null,
    logoUrl: assetToDataUrl(company?.logo_asset_id),
  }
  res.json(data)
})
