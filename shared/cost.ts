/**
 * Modelo de custo de impressão de cartões PVC.
 *
 * Todas as funções são puras (sem I/O) para facilitar testes e uso tanto no
 * servidor quanto no cliente. Valores monetários em reais (BRL).
 */

export type RibbonYieldMode = 'per_side' | 'per_card'

export interface RibbonSpec {
  /** Nome comercial, ex.: "YMCKT 500 imagens" */
  name: string
  /** Código/part number opcional */
  partNumber?: string
  /** Preço da fita (R$) */
  price: number
  /** Rendimento nominal (imagens ou cartões, conforme yieldMode) */
  yieldImages: number
  /**
   * per_side: cada face impressa consome uma "imagem" da fita (fitas YMCKT, K, KT).
   * per_card: o rendimento já contempla frente + verso (fitas YMCKT-K, YMCKT-KT).
   */
  yieldMode: RibbonYieldMode
  /** Painéis, apenas informativo (YMCKT, YMCKT-K, K...) */
  panels?: string
}

export interface CostParams {
  /** Preço unitário do cartão PVC em branco (R$) */
  cardUnitPrice: number
  ribbon: RibbonSpec
  /** Kit de limpeza: preço do kit, quantas limpezas o kit rende e a cada quantos cartões se limpa */
  cleaningKitPrice: number
  cleaningCardsPerKit: number
  cleaningIntervalCards: number
  /** Depreciação da impressora: preço dividido pela vida útil estimada em cartões */
  printerPrice: number
  printerLifeCards: number
  /** Cabeça de impressão: preço e vida útil em cartões (0 = ignorar) */
  printheadPrice: number
  printheadLifeCards: number
  /** Mão de obra: custo por hora e minutos gastos por cartão (cadastro, foto, conferência) */
  laborCostPerHour: number
  minutesPerCard: number
  /** Energia: tarifa (R$/kWh), potência média da impressora (W) e segundos por face */
  energyPricePerKwh: number
  printerWatts: number
  secondsPerSide: number
  /** Taxa de desperdício/reimpressão (%) aplicada aos insumos */
  wasteRatePercent: number
  /** Custos indiretos (%) sobre o custo direto */
  overheadPercent: number
  /** Margem sobre o custo (markup, %) aplicada ao custo total para formar o preço de venda */
  marginPercent: number
  /** Impostos sobre a venda (%) — aplicados "por dentro" no preço final */
  taxPercent: number
}

export interface CostJobInput {
  /** 1 = só frente, 2 = frente e verso */
  sides: 1 | 2
  /** Quantidade de cartões */
  quantity: number
}

export interface CostBreakdown {
  /** Insumos por cartão */
  card: number
  ribbon: number
  cleaning: number
  consumables: number
  /** Desperdício sobre insumos */
  waste: number
  /** Equipamento por cartão */
  depreciation: number
  printhead: number
  /** Operação por cartão */
  labor: number
  energy: number
  /** Custo direto por cartão (insumos + desperdício + equipamento + operação) */
  directCost: number
  overhead: number
  /** Custo total por cartão */
  unitCost: number
  /** Formação de preço por cartão */
  margin: number
  tax: number
  unitPrice: number
  /** Totais do lote */
  quantity: number
  sides: 1 | 2
  totalCost: number
  totalPrice: number
  /** Imagens de fita consumidas por cartão (informativo) */
  ribbonImagesPerCard: number
}

const r4 = (v: number) => Math.round(v * 10000) / 10000

function nonNeg(v: number): number {
  return Number.isFinite(v) && v > 0 ? v : 0
}

export function ribbonImagesPerCard(ribbon: RibbonSpec, sides: 1 | 2): number {
  return ribbon.yieldMode === 'per_card' ? 1 : sides
}

/** Custo de fita por cartão. */
export function ribbonCostPerCard(ribbon: RibbonSpec, sides: 1 | 2): number {
  const yieldImages = nonNeg(ribbon.yieldImages)
  if (yieldImages === 0) return 0
  return (nonNeg(ribbon.price) / yieldImages) * ribbonImagesPerCard(ribbon, sides)
}

export function computeCardCost(params: CostParams, job: CostJobInput): CostBreakdown {
  const sides: 1 | 2 = job.sides === 2 ? 2 : 1
  const quantity = Math.max(0, Math.floor(nonNeg(job.quantity)))

  const card = nonNeg(params.cardUnitPrice)
  const ribbon = ribbonCostPerCard(params.ribbon, sides)
  const perCleaning = nonNeg(params.cleaningCardsPerKit) > 0 ? nonNeg(params.cleaningKitPrice) / nonNeg(params.cleaningCardsPerKit) : nonNeg(params.cleaningKitPrice)
  const cleaning = nonNeg(params.cleaningIntervalCards) > 0 ? perCleaning / nonNeg(params.cleaningIntervalCards) : 0
  const consumables = card + ribbon + cleaning
  const waste = consumables * (nonNeg(params.wasteRatePercent) / 100)

  const depreciation = nonNeg(params.printerLifeCards) > 0 ? nonNeg(params.printerPrice) / nonNeg(params.printerLifeCards) : 0
  const printhead = nonNeg(params.printheadLifeCards) > 0 ? nonNeg(params.printheadPrice) / nonNeg(params.printheadLifeCards) : 0

  const labor = (nonNeg(params.laborCostPerHour) / 60) * nonNeg(params.minutesPerCard)
  const kwh = (nonNeg(params.printerWatts) / 1000) * ((nonNeg(params.secondsPerSide) * sides) / 3600)
  const energy = kwh * nonNeg(params.energyPricePerKwh)

  const directCost = consumables + waste + depreciation + printhead + labor + energy
  const overhead = directCost * (nonNeg(params.overheadPercent) / 100)
  const unitCost = directCost + overhead

  const margin = unitCost * (nonNeg(params.marginPercent) / 100)
  const priceBeforeTax = unitCost + margin
  // Imposto "por dentro": preço = base / (1 - t)
  const taxRate = Math.min(nonNeg(params.taxPercent), 99) / 100
  const unitPrice = taxRate > 0 ? priceBeforeTax / (1 - taxRate) : priceBeforeTax
  const tax = unitPrice - priceBeforeTax

  return {
    card: r4(card),
    ribbon: r4(ribbon),
    cleaning: r4(cleaning),
    consumables: r4(consumables),
    waste: r4(waste),
    depreciation: r4(depreciation),
    printhead: r4(printhead),
    labor: r4(labor),
    energy: r4(energy),
    directCost: r4(directCost),
    overhead: r4(overhead),
    unitCost: r4(unitCost),
    margin: r4(margin),
    tax: r4(tax),
    unitPrice: r4(unitPrice),
    quantity,
    sides,
    totalCost: r4(r4(unitCost) * quantity),
    totalPrice: r4(r4(unitPrice) * quantity),
    ribbonImagesPerCard: ribbonImagesPerCard(params.ribbon, sides),
  }
}

/**
 * Fitas usadas nas impressoras Entrust Sigma DS1/DS2/DS3.
 * Os rendimentos são os nominais divulgados pela Entrust; confira sempre na
 * embalagem da fita, pois variam conforme o kit. Preços são apenas sugestões
 * iniciais em BRL e devem ser ajustados pelo usuário.
 */
export const SIGMA_RIBBON_PRESETS: RibbonSpec[] = [
  { name: 'YMCKT colorido — 500 imagens', panels: 'YMCKT', price: 550, yieldImages: 500, yieldMode: 'per_side' },
  { name: 'YMCKT-K colorido frente + preto verso — 375 cartões', panels: 'YMCKT-K', price: 560, yieldImages: 375, yieldMode: 'per_card' },
  { name: 'YMCKT-KT colorido frente + preto verso c/ verniz — 300 cartões', panels: 'YMCKT-KT', price: 560, yieldImages: 300, yieldMode: 'per_card' },
  { name: 'KT preto com verniz — 1.000 imagens', panels: 'KT', price: 220, yieldImages: 1000, yieldMode: 'per_side' },
  { name: 'K preto — 1.500 imagens', panels: 'K', price: 160, yieldImages: 1500, yieldMode: 'per_side' },
]

export const DEFAULT_COST_PARAMS: CostParams = {
  cardUnitPrice: 0.9,
  ribbon: SIGMA_RIBBON_PRESETS[0],
  cleaningKitPrice: 120,
  cleaningCardsPerKit: 10,
  cleaningIntervalCards: 500,
  printerPrice: 12000,
  printerLifeCards: 50000,
  printheadPrice: 3500,
  printheadLifeCards: 25000,
  laborCostPerHour: 25,
  minutesPerCard: 2,
  energyPricePerKwh: 0.95,
  printerWatts: 120,
  secondsPerSide: 25,
  wasteRatePercent: 3,
  overheadPercent: 10,
  marginPercent: 40,
  taxPercent: 0,
}

/** Garante que um objeto vindo do banco/cliente tenha todos os campos, preenchendo com os padrões. */
export function normalizeCostParams(input: unknown): CostParams {
  const src = (input && typeof input === 'object' ? input : {}) as Partial<CostParams>
  const hasRibbon = !!src.ribbon && typeof src.ribbon === 'object'
  const ribbonSrc = (hasRibbon ? src.ribbon : {}) as Partial<RibbonSpec>
  const n = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
  const d = DEFAULT_COST_PARAMS
  const ribbon: RibbonSpec = hasRibbon
    ? {
        name: typeof ribbonSrc.name === 'string' && ribbonSrc.name ? ribbonSrc.name : d.ribbon.name,
        price: n(ribbonSrc.price, d.ribbon.price),
        yieldImages: n(ribbonSrc.yieldImages, d.ribbon.yieldImages),
        yieldMode: ribbonSrc.yieldMode === 'per_card' ? 'per_card' : 'per_side',
      }
    : { ...d.ribbon }
  if (hasRibbon && typeof ribbonSrc.partNumber === 'string') ribbon.partNumber = ribbonSrc.partNumber
  if (hasRibbon && typeof ribbonSrc.panels === 'string') ribbon.panels = ribbonSrc.panels
  return {
    cardUnitPrice: n(src.cardUnitPrice, d.cardUnitPrice),
    ribbon,
    cleaningKitPrice: n(src.cleaningKitPrice, d.cleaningKitPrice),
    cleaningCardsPerKit: n(src.cleaningCardsPerKit, d.cleaningCardsPerKit),
    cleaningIntervalCards: n(src.cleaningIntervalCards, d.cleaningIntervalCards),
    printerPrice: n(src.printerPrice, d.printerPrice),
    printerLifeCards: n(src.printerLifeCards, d.printerLifeCards),
    printheadPrice: n(src.printheadPrice, d.printheadPrice),
    printheadLifeCards: n(src.printheadLifeCards, d.printheadLifeCards),
    laborCostPerHour: n(src.laborCostPerHour, d.laborCostPerHour),
    minutesPerCard: n(src.minutesPerCard, d.minutesPerCard),
    energyPricePerKwh: n(src.energyPricePerKwh, d.energyPricePerKwh),
    printerWatts: n(src.printerWatts, d.printerWatts),
    secondsPerSide: n(src.secondsPerSide, d.secondsPerSide),
    wasteRatePercent: n(src.wasteRatePercent, d.wasteRatePercent),
    overheadPercent: n(src.overheadPercent, d.overheadPercent),
    marginPercent: n(src.marginPercent, d.marginPercent),
    taxPercent: n(src.taxPercent, d.taxPercent),
  }
}
