import { Router } from 'express'
import { z } from 'zod'
import { getDb, getJsonSetting, setJsonSetting } from '../lib/db.js'
import { validate } from '../lib/http.js'
import { computeCardCost, DEFAULT_COST_PARAMS, normalizeCostParams, SIGMA_RIBBON_PRESETS, type CostParams } from '../../../shared/cost.js'

export const costRouter = Router()

const SETTING_KEY = 'cost_params'

export async function getActiveCostParams(): Promise<CostParams> {
  return normalizeCostParams(await getJsonSetting(SETTING_KEY, DEFAULT_COST_PARAMS))
}

costRouter.get('/params', async (_req, res) => {
  res.json({ params: await getActiveCostParams(), defaults: DEFAULT_COST_PARAMS })
})

costRouter.put('/params', async (req, res) => {
  const params = normalizeCostParams(req.body?.params ?? req.body)
  await setJsonSetting(SETTING_KEY, params)
  res.json({ params })
})

costRouter.get('/presets', (_req, res) => {
  res.json({ ribbons: SIGMA_RIBBON_PRESETS })
})

const calcSchema = z.object({
  sides: z.union([z.literal(1), z.literal(2)]).default(1),
  quantity: z.number().int().min(0).max(1_000_000).default(1),
  params: z.unknown().optional(),
})

costRouter.post('/calculate', async (req, res) => {
  const body = validate(calcSchema, req.body)
  const params = body.params ? normalizeCostParams(body.params) : await getActiveCostParams()
  res.json({ params, breakdown: computeCardCost(params, { sides: body.sides, quantity: body.quantity }) })
})

/** Resumo do que já foi impresso (custo acumulado por período). */
costRouter.get('/summary', async (req, res) => {
  const db = await getDb()
  const from = typeof req.query.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from) ? req.query.from : null
  const to = typeof req.query.to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to) ? req.query.to : null
  const conds = ["status = 'done'"]
  const params: string[] = []
  if (from) {
    conds.push('substr(created_at, 1, 10) >= ?')
    params.push(from)
  }
  if (to) {
    conds.push('substr(created_at, 1, 10) <= ?')
    params.push(to)
  }
  const where = conds.join(' AND ')
  const t = await db.get<{ jobs: number; cards: number; total: number }>(
    `SELECT COUNT(*) AS jobs, COALESCE(SUM(copies), 0) AS cards, COALESCE(SUM(total_cost), 0) AS total FROM print_jobs WHERE ${where}`,
    params,
  )
  const byMonth = await db.all<{ month: string; jobs: number; cards: number; total: number }>(
    `SELECT substr(created_at, 1, 7) AS month, COUNT(*) AS jobs, COALESCE(SUM(copies), 0) AS cards, COALESCE(SUM(total_cost), 0) AS total
     FROM print_jobs WHERE ${where} GROUP BY substr(created_at, 1, 7) ORDER BY month DESC LIMIT 24`,
    params,
  )
  const byCompany = await db.all<{ company: string; jobs: number; cards: number; total: number }>(
    `SELECT COALESCE(c.name, '(sem empresa)') AS company, COUNT(*) AS jobs, COALESCE(SUM(j.copies), 0) AS cards, COALESCE(SUM(j.total_cost), 0) AS total
     FROM print_jobs j LEFT JOIN persons p ON p.id = j.person_id LEFT JOIN companies c ON c.id = p.company_id
     WHERE ${where.replace(/\bstatus\b/, 'j.status').replace(/created_at/g, 'j.created_at')} GROUP BY COALESCE(c.name, '(sem empresa)') ORDER BY total DESC LIMIT 50`,
    params,
  )
  res.json({
    totals: { jobs: Number(t?.jobs ?? 0), cards: Number(t?.cards ?? 0), totalCost: Number(t?.total ?? 0) },
    byMonth: byMonth.map((m) => ({ month: m.month, jobs: Number(m.jobs), cards: Number(m.cards), totalCost: Number(m.total) })),
    byCompany: byCompany.map((c) => ({ company: c.company, jobs: Number(c.jobs), cards: Number(c.cards), totalCost: Number(c.total) })),
  })
})
