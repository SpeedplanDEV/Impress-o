import { useEffect, useMemo, useState } from 'react'
import { costApi } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { computeCardCost, type CostParams, type RibbonSpec } from '@shared/cost'
import { brl, brl4 } from '../lib/format'

export default function CostPage() {
  const loaded = useAsync(() => costApi.params())
  const presets = useAsync(() => costApi.presets())
  const summary = useAsync(() => costApi.summary())
  const [params, setParams] = useState<CostParams | null>(null)
  const [sides, setSides] = useState<1 | 2>(1)
  const [quantity, setQuantity] = useState(100)
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (loaded.data && !params) setParams(loaded.data.params)
  }, [loaded.data, params])

  const breakdown = useMemo(() => (params ? computeCardCost(params, { sides, quantity }) : null), [params, sides, quantity])

  const set = <K extends keyof CostParams>(k: K, v: CostParams[K]) => setParams((p) => (p ? { ...p, [k]: v } : p))
  const num = (k: Exclude<keyof CostParams, 'ribbon'>) => ({
    type: 'number' as const,
    step: 'any' as const,
    min: 0,
    value: params ? params[k] : 0,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k, Number(e.target.value) as CostParams[typeof k]),
  })
  const setRibbon = (patch: Partial<RibbonSpec>) => setParams((p) => (p ? { ...p, ribbon: { ...p.ribbon, ...patch } } : p))

  async function save() {
    if (!params) return
    try {
      const r = await costApi.saveParams(params)
      setParams(r.params)
      setMessage({ kind: 'success', text: 'Parâmetros de custo salvos. Cada nova impressão registrará o custo com estes valores.' })
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : String(err) })
    }
  }

  if (!params) return <div className="muted">{loaded.error ? <div className="alert error">{loaded.error}</div> : 'Carregando…'}</div>

  return (
    <div>
      <div className="page-header">
        <h1>Custo de impressão</h1>
        <div className="btn-group">
          <button className="btn" onClick={() => loaded.data && setParams(loaded.data.defaults)}>Restaurar padrões</button>
          <button className="btn primary" onClick={() => void save()}>Salvar parâmetros</button>
        </div>
      </div>
      {message && <div className={`alert ${message.kind}`}>{message.text}</div>}

      <div className="grid cols-2">
        <div className="stack">
          <div className="card">
            <h2>Insumos</h2>
            <div className="grid cols-2">
              <label>Cartão PVC em branco (R$/unidade)<input {...num('cardUnitPrice')} /></label>
              <label>
                Fita (ribbon) — preset Sigma DS
                <select value="" onChange={(e) => { const r = presets.data?.ribbons[Number(e.target.value)]; if (r) setRibbon(r) }}>
                  <option value="">— escolher preset —</option>
                  {presets.data?.ribbons.map((r, i) => <option key={i} value={i}>{r.name}</option>)}
                </select>
              </label>
              <label>Nome da fita<input value={params.ribbon.name} onChange={(e) => setRibbon({ name: e.target.value })} /></label>
              <label>Preço da fita (R$)<input type="number" step="any" min={0} value={params.ribbon.price} onChange={(e) => setRibbon({ price: Number(e.target.value) })} /></label>
              <label>Rendimento (imagens/cartões por fita)<input type="number" min={1} value={params.ribbon.yieldImages} onChange={(e) => setRibbon({ yieldImages: Number(e.target.value) })} /></label>
              <label>
                Como contar o rendimento
                <select value={params.ribbon.yieldMode} onChange={(e) => setRibbon({ yieldMode: e.target.value as 'per_side' | 'per_card' })}>
                  <option value="per_side">Por face (YMCKT, K, KT — verso consome outra imagem)</option>
                  <option value="per_card">Por cartão (YMCKT-K, YMCKT-KT — frente + verso incluídos)</option>
                </select>
              </label>
              <label>Kit de limpeza (R$)<input {...num('cleaningKitPrice')} /></label>
              <label>Limpezas por kit (cartões/hastes no kit)<input {...num('cleaningCardsPerKit')} /></label>
              <label>Fazer uma limpeza a cada N cartões impressos<input {...num('cleaningIntervalCards')} /></label>
              <label>Desperdício / reimpressão (%)<input {...num('wasteRatePercent')} /></label>
            </div>
            <p className="small muted" style={{ marginTop: 8 }}>Confira o rendimento nominal na embalagem da fita Entrust; os presets trazem os valores divulgados pelo fabricante e preços apenas sugeridos.</p>
          </div>
          <div className="card">
            <h2>Equipamento</h2>
            <div className="grid cols-2">
              <label>Preço da impressora (R$)<input {...num('printerPrice')} /></label>
              <label>Vida útil estimada (cartões)<input {...num('printerLifeCards')} /></label>
              <label>Cabeça de impressão (R$)<input {...num('printheadPrice')} /></label>
              <label>Vida útil da cabeça (cartões)<input {...num('printheadLifeCards')} /></label>
            </div>
          </div>
          <div className="card">
            <h2>Operação e formação de preço</h2>
            <div className="grid cols-2">
              <label>Mão de obra (R$/hora)<input {...num('laborCostPerHour')} /></label>
              <label>Minutos por cartão (cadastro, foto, conferência)<input {...num('minutesPerCard')} /></label>
              <label>Energia (R$/kWh)<input {...num('energyPricePerKwh')} /></label>
              <label>Potência média da impressora (W)<input {...num('printerWatts')} /></label>
              <label>Segundos de impressão por face<input {...num('secondsPerSide')} /></label>
              <label>Custos indiretos (%)<input {...num('overheadPercent')} /></label>
              <label>Margem sobre o custo (markup, %)<input {...num('marginPercent')} /></label>
              <label>Impostos sobre a venda (%)<input {...num('taxPercent')} /></label>
            </div>
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <h2>Calculadora</h2>
            <div className="row">
              <label className="inline">
                Faces
                <select value={sides} onChange={(e) => setSides(Number(e.target.value) as 1 | 2)}>
                  <option value={1}>Só frente</option>
                  <option value={2}>Frente e verso</option>
                </select>
              </label>
              <label className="inline">
                Quantidade
                <input type="number" min={0} value={quantity} onChange={(e) => setQuantity(Math.max(0, Number(e.target.value) || 0))} style={{ width: 100 }} />
              </label>
            </div>
            {breakdown && (
              <>
                <div className="grid cols-3" style={{ marginTop: 12 }}>
                  <div className="stat"><span className="muted small">Custo por cartão</span><span className="value">{brl.format(breakdown.unitCost)}</span></div>
                  <div className="stat"><span className="muted small">Preço sugerido / cartão</span><span className="value">{brl.format(breakdown.unitPrice)}</span></div>
                  <div className="stat"><span className="muted small">Total do lote ({breakdown.quantity})</span><span className="value">{brl.format(breakdown.totalCost)}</span></div>
                </div>
                <table style={{ marginTop: 12 }}>
                  <tbody>
                    <Row label="Cartão PVC" v={breakdown.card} />
                    <Row label={`Fita (${breakdown.ribbonImagesPerCard} imagem(ns) por cartão)`} v={breakdown.ribbon} />
                    <Row label="Limpeza" v={breakdown.cleaning} />
                    <Row label="Desperdício" v={breakdown.waste} />
                    <Row label="Depreciação da impressora" v={breakdown.depreciation} />
                    <Row label="Cabeça de impressão" v={breakdown.printhead} />
                    <Row label="Mão de obra" v={breakdown.labor} />
                    <Row label="Energia" v={breakdown.energy} />
                    <Row label="Custo direto" v={breakdown.directCost} bold />
                    <Row label="Custos indiretos" v={breakdown.overhead} />
                    <Row label="Custo total por cartão" v={breakdown.unitCost} bold />
                    <Row label={`Margem sobre o custo (${Math.round((breakdown.margin / (breakdown.unitPrice || 1)) * 1000) / 10}% do preço)`} v={breakdown.margin} />
                    <Row label="Impostos" v={breakdown.tax} />
                    <Row label="Preço de venda por cartão" v={breakdown.unitPrice} bold />
                    <Row label="Receita do lote" v={breakdown.totalPrice} bold />
                  </tbody>
                </table>
              </>
            )}
          </div>
          <div className="card">
            <h2>Impressões realizadas</h2>
            {summary.data && (
              <>
                <div className="grid cols-3">
                  <div className="stat"><span className="muted small">Trabalhos</span><span className="value">{summary.data.totals.jobs}</span></div>
                  <div className="stat"><span className="muted small">Cartões</span><span className="value">{summary.data.totals.cards}</span></div>
                  <div className="stat"><span className="muted small">Custo acumulado</span><span className="value">{brl.format(summary.data.totals.totalCost)}</span></div>
                </div>
                {summary.data.byMonth.length > 0 && (
                  <table style={{ marginTop: 12 }}>
                    <thead><tr><th>Mês</th><th className="num">Trabalhos</th><th className="num">Cartões</th><th className="num">Custo</th></tr></thead>
                    <tbody>
                      {summary.data.byMonth.map((m) => (
                        <tr key={m.month}><td>{m.month}</td><td className="num">{m.jobs}</td><td className="num">{m.cards}</td><td className="num">{brl.format(m.totalCost)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {summary.data.byCompany.length > 0 && (
                  <table style={{ marginTop: 12 }}>
                    <thead><tr><th>Empresa</th><th className="num">Cartões</th><th className="num">Custo</th></tr></thead>
                    <tbody>
                      {summary.data.byCompany.map((c) => (
                        <tr key={c.company}><td>{c.company}</td><td className="num">{c.cards}</td><td className="num">{brl.format(c.totalCost)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({ label, v, bold }: { label: string; v: number; bold?: boolean }) {
  return (
    <tr>
      <td style={{ fontWeight: bold ? 600 : 400 }}>{label}</td>
      <td className="num" style={{ fontWeight: bold ? 600 : 400 }}>{brl4.format(v)}</td>
    </tr>
  )
}
