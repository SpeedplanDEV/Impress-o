import { Router } from 'express'
import { z } from 'zod'
import { getDb, getJsonSetting, setJsonSetting } from '../lib/db.js'
import { validate } from '../lib/http.js'
import { computeCardCost, DEFAULT_COST_PARAMS, normalizeCostParams, SIGMA_RIBBON_PRESETS, type CostParams } from '../../../shared/cost.js'

export const costRouter = Router()

const SETTING_KEY = 'cost_params'

export function getActiveCostParams(): CostParams {
  return normalizeCostParams(getJsonSetting(SETTING_KEY, DEFAULT_COST_PARAMS))
}

costRouter.get('/params', (_req, res) => {
  res.json({ params: getActiveCostParams(), defaults: DEFAULT_COST_PARAMS })
})

costRouter.put('/params', (req, res) => {
  const params = normalizeCostParams(req.body?.params ?? req.body)
  setJsonSetting(SETTING_KEY, params)
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

costRouter.post('/calculate', (req, res) => {
  const body = validate(calcSchema, req.body)
  const params = body.params ? normalizeCostParams(body.params) : getActiveCostParams()
  res.json({ params, breakdown: computeCardCost(params, { sides: body.sides, quantity: body.quantity }) })
})

/** Resumo do que já foi impresso (custo acumulado por período). */
costRouter.get('/summary', (req, res) => {
  const db = getDb()
  const from = typeof req.query.from === 'string' && req.query.from ? req.query.from : null
  const to = typeof req.query.to === 'string' && req.query.to ? `${req.query.to} 23:59:59` : null
  const totals = db
    .prepare(
      `SELECT COUNT(*) AS jobs, COALESCE(SUM(copies), 0) AS cards, COALESCE(SUM(total_cost), 0) AS total_cost
       FROM print_jobs WHERE status = 'done' AND (? IS NULL OR created_at >= ?) AND (? IS NULL OR created_at <= ?)`,
    )
    .get(from, from, to, to) as unknown as { jobs: number; cards: number; total_cost: number }
  const byMonth = db
    .prepare(
      `SELECT substr(created_at, 1, 7) AS month, COUNT(*) AS jobs, COALESCE(SUM(copies), 0) AS cards, COALESCE(SUM(total_cost), 0) AS total_cost
       FROM print_jobs WHERE status = 'done' GROUP BY month ORDER BY month DESC LIMIT 24`,
    )
    .all() as unknown as { month: string; jobs: number; cards: number; total_cost: number }[]
  const byCompany = db
    .prepare(
      `SELECT COALESCE(c.name, '(sem empresa)') AS company, COUNT(*) AS jobs, COALESCE(SUM(j.copies), 0) AS cards, COALESCE(SUM(j.total_cost), 0) AS total_cost
       FROM print_jobs j LEFT JOIN persons p ON p.id = j.person_id LEFT JOIN companies c ON c.id = p.company_id
       WHERE j.status = 'done' GROUP BY company ORDER BY total_cost DESC LIMIT 50`,
    )
    .all() as unknown as { company: string; jobs: number; cards: number; total_cost: number }[]
  res.json({ totals, byMonth, byCompany })
})
