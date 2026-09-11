import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { cardsApi, companiesApi, departmentsApi, personsApi, printApi, printersApi, templatesApi, costApi, downloadBlob, errorMessage } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { renderCardForPrint } from '../editor/render'
import { brl, formatDateTime } from '../lib/format'
import { statusLabel } from './HomePage'
import type { Person, PrintJob, TemplateFull } from '../lib/types'
import type { CostBreakdown } from '@shared/cost'

interface Rendered {
  personId: number
  personName: string
  template: TemplateFull
  front: string
  back: string | null
  warnings: string[]
}

export default function PrintPage() {
  const [params] = useSearchParams()
  const initialPerson = params.get('pessoa') ? Number(params.get('pessoa')) : null
  const [q, setQ] = useState('')
  const [companyId, setCompanyId] = useState<number | null>(null)
  const [departmentId, setDepartmentId] = useState<number | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set(initialPerson ? [initialPerson] : []))
  const [templateOverride, setTemplateOverride] = useState<number | null>(null)
  const [printerId, setPrinterId] = useState<number | null>(null)
  const [copies, setCopies] = useState(1)
  const [rendered, setRendered] = useState<Rendered[]>([])
  const [rendering, setRendering] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [log, setLog] = useState<{ kind: 'success' | 'error' | 'info'; text: string }[]>([])
  const [estimate, setEstimate] = useState<CostBreakdown | null>(null)

  const companies = useAsync(() => companiesApi.list())
  const departments = useAsync(() => departmentsApi.list(companyId), [companyId])
  const persons = useAsync(() => personsApi.list({ q, companyId, departmentId, active: true }), [q, companyId, departmentId])
  const templates = useAsync(() => templatesApi.list())
  const printers = useAsync(() => printersApi.list())
  const jobs = useAsync(() => printApi.jobs(50))

  useEffect(() => {
    if (printers.data && printerId === null) {
      const d = printers.data.find((p) => p.isDefault) ?? printers.data[0]
      if (d) setPrinterId(d.id)
    }
  }, [printers.data, printerId])

  const selectedPersons = useMemo(() => (persons.data ?? []).filter((p) => selected.has(p.id)), [persons.data, selected])
  const sides = rendered.some((r) => r.back) ? 2 : 1
  const [stale, setStale] = useState(false)
  useEffect(() => {
    const qty = (rendered.length > 0 ? rendered.length : selected.size) * copies
    if (qty === 0) {
      setEstimate(null)
      return
    }
    costApi.calculate({ sides: sides as 1 | 2, quantity: qty }).then((r) => setEstimate(r.breakdown)).catch(() => setEstimate(null))
  }, [selected.size, rendered.length, copies, sides])
  // Mudou a seleção ou o modelo depois de gerar: a pré-visualização fica marcada como desatualizada
  useEffect(() => {
    if (rendered.length === 0) return
    const ids = new Set(rendered.map((r) => r.personId))
    const same = ids.size === selected.size && [...selected].every((id) => ids.has(id))
    setStale(!same)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, templateOverride])

  function toggle(id: number) {
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  async function renderAll(list: Person[] = selectedPersons) {
    setRendering(true)
    setLog([])
    const out: Rendered[] = []
    for (const p of list) {
      try {
        const template = templateOverride ? await templatesApi.get(templateOverride) : await templatesApi.resolve(p.id)
        if (!template) {
          setLog((l) => [...l, { kind: 'error', text: `${p.fullName}: nenhum modelo de cartão disponível. Crie um modelo em "Modelos de cartão".` }])
          continue
        }
        const data = await cardsApi.data(p.id)
        const r = await renderCardForPrint(template.design, data)
        out.push({ personId: p.id, personName: p.fullName, template, front: r.front, back: r.back, warnings: r.warnings })
      } catch (err) {
        setLog((l) => [...l, { kind: 'error', text: `${p.fullName}: ${errorMessage(err)}` }])
      }
    }
    setRendered(out)
    setStale(false)
    setRendering(false)
  }

  // Renderiza automaticamente quando abre com ?pessoa=
  useEffect(() => {
    if (initialPerson && persons.data && rendered.length === 0 && !rendering) {
      const p = persons.data.find((x) => x.id === initialPerson)
      if (p) void renderAll([p])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persons.data])

  async function printAll() {
    if (!printerId) {
      setLog((l) => [...l, { kind: 'error', text: 'Configure uma impressora em Configurações antes de imprimir.' }])
      return
    }
    setPrinting(true)
    let ok = 0
    for (const r of rendered) {
      try {
        const res = await printApi.createJob({
          printerId,
          personId: r.personId,
          templateId: r.template.id,
          personName: r.personName,
          templateName: r.template.name,
          orientation: r.template.design.orientation,
          copies,
          frontPng: r.front,
          backPng: r.back,
        })
        ok++
        setLog((l) => [...l, { kind: 'success', text: `${r.personName}: ${res.result.message} Custo: ${brl.format(res.job.totalCost ?? 0)}` }])
      } catch (err) {
        setLog((l) => [...l, { kind: 'error', text: `${r.personName}: ${errorMessage(err)}` }])
      }
    }
    setPrinting(false)
    setLog((l) => [...l, { kind: 'info', text: `${ok} de ${rendered.length} cartão(ões) enviado(s) à impressora.` }])
    await jobs.reload()
  }

  async function downloadPdf(r: Rendered) {
    try {
      const blob = await printApi.downloadPdf({ orientation: r.template.design.orientation, frontPng: r.front, backPng: r.back, fileName: r.personName.slice(0, 100) })
      downloadBlob(blob, `${r.personName.replace(/\s+/g, '_')}.pdf`)
    } catch (err) {
      setLog((l) => [...l, { kind: 'error', text: errorMessage(err) }])
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Impressão</h1>
        <div className="row">
          <label className="inline">
            Impressora
            <select value={printerId ?? ''} onChange={(e) => setPrinterId(e.target.value ? Number(e.target.value) : null)} style={{ width: 240 }}>
              {printers.data?.length === 0 && <option value="">Nenhuma configurada</option>}
              {printers.data?.map((p) => <option key={p.id} value={p.id}>{p.name}{p.adapter === 'mock' ? ' (simulada)' : ''}</option>)}
            </select>
          </label>
          <label className="inline">
            Cópias
            <input type="number" min={1} max={100} value={copies} onChange={(e) => setCopies(Math.min(100, Math.max(1, Number(e.target.value) || 1)))} style={{ width: 70 }} />
          </label>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h2>1. Escolha as pessoas</h2>
          <div className="row" style={{ marginBottom: 10 }}>
            <input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 200 }} />
            <select value={companyId ?? ''} onChange={(e) => { setCompanyId(e.target.value ? Number(e.target.value) : null); setDepartmentId(null) }} style={{ maxWidth: 200 }}>
              <option value="">Todas as empresas</option>
              {companies.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={departmentId ?? ''} onChange={(e) => setDepartmentId(e.target.value ? Number(e.target.value) : null)} style={{ maxWidth: 200 }}>
              <option value="">Todos os departamentos</option>
              {departments.data?.map((d) => <option key={d.id} value={d.id}>{companyId ? d.name : `${d.companyName} · ${d.name}`}</option>)}
            </select>
          </div>
          <div className="row" style={{ marginBottom: 8 }}>
            <button className="btn small" onClick={() => setSelected(new Set((persons.data ?? []).map((p) => p.id)))}>Selecionar todos ({persons.data?.length ?? 0})</button>
            <button className="btn small ghost" onClick={() => setSelected(new Set())}>Limpar</button>
            <span className="muted small">{selected.size} selecionada(s)</span>
          </div>
          <div style={{ maxHeight: 360, overflow: 'auto' }}>
            {persons.data?.length === 0 && <div className="empty">Nenhuma pessoa ativa encontrada.</div>}
            {persons.data && persons.data.length > 0 && (
              <table>
                <tbody>
                  {persons.data.map((p) => (
                    <tr key={p.id} onClick={() => toggle(p.id)} style={{ cursor: 'pointer' }}>
                      <td style={{ width: 30 }}><input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} onClick={(e) => e.stopPropagation()} /></td>
                      <td style={{ width: 40 }}>{p.photoUrl ? <img src={p.photoUrl} alt="" className="photo-3x4" style={{ width: 30, height: 40 }} /> : <span className="photo-3x4" style={{ width: 30, height: 40, display: 'inline-block' }} />}</td>
                      <td>{p.fullName}<div className="small muted">{p.roleTitle ?? ''}{p.departmentName ? ` · ${p.departmentName}` : ''}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <hr />
          <h2>2. Modelo e pré-visualização</h2>
          <div className="row">
            <label className="inline">
              Modelo
              <select value={templateOverride ?? ''} onChange={(e) => setTemplateOverride(e.target.value ? Number(e.target.value) : null)} style={{ width: 260 }}>
                <option value="">Automático (pessoa → departamento → empresa)</option>
                {templates.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <button className="btn primary" onClick={() => void renderAll()} disabled={selected.size === 0 || rendering}>{rendering ? 'Gerando…' : 'Gerar pré-visualização'}</button>
          </div>
        </div>

        <div className="card">
          <h2>3. Conferir e imprimir</h2>
          {estimate && (
            <div className="alert info small">
              Custo estimado: <strong>{brl.format(estimate.unitCost)}</strong> por cartão × {estimate.quantity} = <strong>{brl.format(estimate.totalCost)}</strong> ({estimate.sides === 2 ? 'frente e verso' : 'só frente'}).
            </div>
          )}
          {rendered.length === 0 && <div className="empty">Selecione pessoas e clique em "Gerar pré-visualização".</div>}
          {stale && rendered.length > 0 && <div className="alert warning small">A seleção ou o modelo mudou depois da pré-visualização. Gere novamente antes de imprimir.</div>}
          <div className="stack" style={{ maxHeight: 520, overflow: 'auto' }}>
            {rendered.map((r) => (
              <div key={r.personId} className="card" style={{ padding: 10 }}>
                <div className="row between">
                  <strong>{r.personName}</strong>
                  <span className="small muted">{r.template.name}</span>
                </div>
                <div className="row" style={{ marginTop: 6, alignItems: 'flex-start' }}>
                  <img src={r.front} alt="Frente" className="card-preview" style={{ width: r.template.design.orientation === 'landscape' ? 300 : 190 }} />
                  {r.back && <img src={r.back} alt="Verso" className="card-preview" style={{ width: r.template.design.orientation === 'landscape' ? 300 : 190 }} />}
                </div>
                {r.warnings.length > 0 && <div className="alert warning small" style={{ marginTop: 6 }}>{r.warnings.join(' ')}</div>}
                <div className="btn-group" style={{ marginTop: 6 }}>
                  <button className="btn small" onClick={() => downloadBlob(r.front, `${r.personName.replace(/\s+/g, '_')}-frente.png`)}>Baixar PNG</button>
                  <button className="btn small" onClick={() => void downloadPdf(r)}>Baixar PDF</button>
                </div>
              </div>
            ))}
          </div>
          {rendered.length > 0 && (
            <div className="row end" style={{ marginTop: 12 }}>
              <button className="btn primary" onClick={() => void printAll()} disabled={printing || !printerId || stale}>
                {printing ? 'Enviando…' : `Imprimir ${rendered.length} cartão(ões) × ${copies}`}
              </button>
            </div>
          )}
          {log.length > 0 && (
            <div className="stack" style={{ marginTop: 10 }}>
              {log.map((l, i) => <div key={i} className={`alert ${l.kind} small`} style={{ margin: 0 }}>{l.text}</div>)}
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="row between"><h2 style={{ margin: 0 }}>Histórico de impressões</h2><button className="btn small" onClick={() => void jobs.reload()}>Atualizar</button></div>
        <JobsTable jobs={jobs.data ?? []} onDelete={async (id) => { await printApi.removeJob(id); await jobs.reload() }} />
      </div>
    </div>
  )
}

export function JobsTable({ jobs, onDelete }: { jobs: PrintJob[]; onDelete?: (id: number) => Promise<void> }) {
  if (jobs.length === 0) return <div className="empty" style={{ marginTop: 10 }}>Nenhuma impressão registrada.</div>
  return (
    <table style={{ marginTop: 10 }}>
      <thead><tr><th>#</th><th>Data</th><th>Pessoa</th><th>Modelo</th><th>Impressora</th><th className="num">Cópias</th><th>Faces</th><th className="num">Custo</th><th>Status</th><th></th></tr></thead>
      <tbody>
        {jobs.map((j) => (
          <tr key={j.id}>
            <td>{j.id}</td>
            <td>{formatDateTime(j.createdAt)}</td>
            <td>{j.personName ?? '—'}</td>
            <td>{j.templateName ?? '—'}</td>
            <td>{j.printerName ?? '—'}</td>
            <td className="num">{j.copies}</td>
            <td>{j.sides === 2 ? 'F+V' : 'F'}</td>
            <td className="num">{j.totalCost != null ? brl.format(j.totalCost) : '—'}</td>
            <td>
              <span className={`badge ${j.status === 'done' ? 'ok' : j.status === 'error' ? 'err' : ''}`} title={j.error ?? ''}>{statusLabel(j.status)}</span>
              {j.error && <div className="small muted" style={{ maxWidth: 260, whiteSpace: 'pre-wrap' }}>{j.error.split('\n')[0]}</div>}
            </td>
            <td className="num">
              <div className="btn-group">
                {j.outputPath && <a className="btn small" href={printApi.outputUrl(j.id, 'frente')} target="_blank" rel="noreferrer">Ver</a>}
                {onDelete && <button className="btn small ghost" onClick={() => void onDelete(j.id)}>✕</button>}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
