import { describe, expect, it } from 'vitest'
import { computeCardCost, DEFAULT_COST_PARAMS, normalizeCostParams, ribbonCostPerCard, type CostParams } from './cost.js'

const base: CostParams = {
  cardUnitPrice: 1,
  ribbon: { name: 'YMCKT', price: 500, yieldImages: 500, yieldMode: 'per_side' },
  cleaningKitPrice: 100,
  cleaningIntervalCards: 1000,
  printerPrice: 10000,
  printerLifeCards: 100000,
  printheadPrice: 2000,
  printheadLifeCards: 20000,
  laborCostPerHour: 60,
  minutesPerCard: 1,
  energyPricePerKwh: 1,
  printerWatts: 100,
  secondsPerSide: 36,
  wasteRatePercent: 0,
  overheadPercent: 0,
  marginPercent: 0,
  taxPercent: 0,
}

describe('ribbonCostPerCard', () => {
  it('fita por face: duplex consome duas imagens', () => {
    expect(ribbonCostPerCard(base.ribbon, 1)).toBeCloseTo(1)
    expect(ribbonCostPerCard(base.ribbon, 2)).toBeCloseTo(2)
  })
  it('fita por cartão (YMCKT-K): custo independe do número de faces', () => {
    const rb = { name: 'YMCKT-K', price: 375, yieldImages: 375, yieldMode: 'per_card' as const }
    expect(ribbonCostPerCard(rb, 1)).toBeCloseTo(1)
    expect(ribbonCostPerCard(rb, 2)).toBeCloseTo(1)
  })
  it('rendimento zero não divide por zero', () => {
    expect(ribbonCostPerCard({ ...base.ribbon, yieldImages: 0 }, 1)).toBe(0)
  })
})

describe('computeCardCost', () => {
  it('soma os componentes por cartão (frente)', () => {
    const c = computeCardCost(base, { sides: 1, quantity: 1 })
    expect(c.card).toBe(1)
    expect(c.ribbon).toBe(1)
    expect(c.cleaning).toBe(0.1)
    expect(c.consumables).toBeCloseTo(2.1)
    expect(c.depreciation).toBe(0.1)
    expect(c.printhead).toBe(0.1)
    expect(c.labor).toBe(1)
    // 100 W * 36 s = 0.001 kWh -> R$ 0,001
    expect(c.energy).toBeCloseTo(0.001)
    expect(c.directCost).toBeCloseTo(3.301)
    expect(c.unitCost).toBeCloseTo(3.301)
    expect(c.unitPrice).toBeCloseTo(3.301)
    expect(c.totalCost).toBeCloseTo(3.301)
  })
  it('frente e verso dobra fita e energia', () => {
    const c = computeCardCost(base, { sides: 2, quantity: 10 })
    expect(c.ribbon).toBe(2)
    expect(c.energy).toBeCloseTo(0.002)
    expect(c.ribbonImagesPerCard).toBe(2)
    expect(c.totalCost).toBeCloseTo(c.unitCost * 10)
  })
  it('aplica desperdício, custos indiretos, margem e imposto por dentro', () => {
    const c = computeCardCost(
      { ...base, wasteRatePercent: 10, overheadPercent: 10, marginPercent: 50, taxPercent: 20 },
      { sides: 1, quantity: 1 },
    )
    expect(c.waste).toBeCloseTo(0.21)
    const direct = 2.1 + 0.21 + 0.1 + 0.1 + 1 + 0.001
    expect(c.directCost).toBeCloseTo(direct)
    expect(c.overhead).toBeCloseTo(direct * 0.1)
    const unit = direct * 1.1
    expect(c.unitCost).toBeCloseTo(unit)
    expect(c.margin).toBeCloseTo(unit * 0.5)
    const before = unit * 1.5
    expect(c.unitPrice).toBeCloseTo(before / 0.8)
    expect(c.tax).toBeCloseTo(before / 0.8 - before)
  })
  it('quantidade inválida vira zero e valores negativos são ignorados', () => {
    const c = computeCardCost({ ...base, cardUnitPrice: -5 }, { sides: 1, quantity: -3 })
    expect(c.card).toBe(0)
    expect(c.quantity).toBe(0)
    expect(c.totalCost).toBe(0)
  })
})

describe('normalizeCostParams', () => {
  it('preenche campos ausentes com os padrões', () => {
    const p = normalizeCostParams({ cardUnitPrice: 2, ribbon: { price: 400 } })
    expect(p.cardUnitPrice).toBe(2)
    expect(p.ribbon.price).toBe(400)
    expect(p.ribbon.yieldImages).toBe(DEFAULT_COST_PARAMS.ribbon.yieldImages)
    expect(p.marginPercent).toBe(DEFAULT_COST_PARAMS.marginPercent)
  })
  it('aceita entrada nula', () => {
    expect(normalizeCostParams(null)).toEqual(DEFAULT_COST_PARAMS)
  })
})
