import { useState, type FormEvent } from 'react'
import { companiesApi, departmentsApi, templatesApi, fileToDataUrl } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import Modal from '../components/Modal'
import FilePicker from '../components/FilePicker'
import type { Company, Department } from '../lib/types'

export default function CompaniesPage() {
  const companies = useAsync(() => companiesApi.list())
  const templates = useAsync(() => templatesApi.list())
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const detail = useAsync(() => (selectedId ? companiesApi.get(selectedId) : Promise.resolve(null)), [selectedId])
  const [editing, setEditing] = useState<Partial<Company> | null>(null)
  const [editingDept, setEditingDept] = useState<Partial<Department> | null>(null)
  const [error, setError] = useState<string | null>(null)

  const templateOptions = (companyId: number | null) => (templates.data ?? []).filter((t) => !t.companyId || t.companyId === companyId)

  async function refreshAll() {
    await companies.reload()
    await detail.reload()
  }

  async function removeCompany(c: Company) {
    if (!confirm(`Excluir a empresa "${c.name}"? Os departamentos serão removidos e as pessoas ficarão sem empresa.`)) return
    try {
      await companiesApi.remove(c.id)
      if (selectedId === c.id) setSelectedId(null)
      await refreshAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function removeDept(d: Department) {
    if (!confirm(`Excluir o departamento "${d.name}"?`)) return
    try {
      await departmentsApi.remove(d.id)
      await refreshAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Empresas e departamentos</h1>
        <button className="btn primary" onClick={() => setEditing({})}>+ Nova empresa</button>
      </div>
      {error && <div className="alert error">{error}</div>}
      {companies.error && <div className="alert error">{companies.error}</div>}
      <div className="grid cols-2">
        <div className="card">
          <h2>Empresas</h2>
          {companies.data?.length === 0 && <div className="empty">Nenhuma empresa cadastrada.</div>}
          {companies.data && companies.data.length > 0 && (
            <table>
              <thead><tr><th>Empresa</th><th className="num">Deptos.</th><th className="num">Pessoas</th><th></th></tr></thead>
              <tbody>
                {companies.data.map((c) => (
                  <tr key={c.id} style={{ cursor: 'pointer', background: selectedId === c.id ? '#eaf2fb' : undefined }} onClick={() => setSelectedId(c.id)}>
                    <td>
                      <div className="row">
                        {c.logoUrl ? <img src={c.logoUrl} alt="" className="thumb" style={{ width: 40, height: 28 }} /> : <span className="thumb" style={{ width: 40, height: 28, display: 'inline-block' }} />}
                        <div>
                          <button className="btn ghost small" style={{ padding: 0, fontWeight: selectedId === c.id ? 600 : 400 }} onClick={(e) => { e.stopPropagation(); setSelectedId(c.id) }} aria-label={`Ver departamentos de ${c.name}`}>{c.name}</button>
                          {c.cnpj && <div className="small muted">{c.cnpj}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="num">{c.departmentsCount}</td>
                    <td className="num">{c.personsCount}</td>
                    <td className="num">
                      <div className="btn-group">
                        <button className="btn small" onClick={(e) => { e.stopPropagation(); setEditing(c) }}>Editar</button>
                        <button className="btn small danger" onClick={(e) => { e.stopPropagation(); void removeCompany(c) }}>Excluir</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          {detail.data ? (
            <>
              <div className="row between">
                <h2 style={{ margin: 0 }}>Departamentos de {detail.data.name}</h2>
                <button className="btn primary small" onClick={() => setEditingDept({ companyId: detail.data!.id })}>+ Novo departamento</button>
              </div>
              <p className="small muted" style={{ marginTop: 6 }}>
                Modelo padrão da empresa: <strong>{templates.data?.find((t) => t.id === detail.data?.defaultTemplateId)?.name ?? 'nenhum'}</strong>. Cada departamento pode ter seu próprio modelo padrão, usado ao imprimir os cartões das pessoas daquele departamento.
              </p>
              {detail.data.departments?.length === 0 && <div className="empty">Nenhum departamento. Crie um para organizar os cartões por setor.</div>}
              {detail.data.departments && detail.data.departments.length > 0 && (
                <table style={{ marginTop: 10 }}>
                  <thead><tr><th>Departamento</th><th>Modelo padrão</th><th className="num">Pessoas</th><th></th></tr></thead>
                  <tbody>
                    {detail.data.departments.map((d) => (
                      <tr key={d.id}>
                        <td><span className="badge" style={{ background: d.color ?? undefined, color: d.color ? '#fff' : undefined }}>{d.name}</span></td>
                        <td>{templates.data?.find((t) => t.id === d.defaultTemplateId)?.name ?? <span className="muted">herda da empresa</span>}</td>
                        <td className="num">{d.personsCount}</td>
                        <td className="num">
                          <div className="btn-group">
                            <button className="btn small" onClick={() => setEditingDept(d)}>Editar</button>
                            <button className="btn small danger" onClick={() => void removeDept(d)}>Excluir</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          ) : (
            <div className="empty">Selecione uma empresa para ver e editar seus departamentos.</div>
          )}
        </div>
      </div>

      {editing && (
        <CompanyForm
          initial={editing}
          templates={templateOptions(editing.id ?? null)}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await refreshAll() }}
        />
      )}
      {editingDept && (
        <DepartmentForm
          initial={editingDept}
          templates={templateOptions(editingDept.companyId ?? null)}
          onClose={() => setEditingDept(null)}
          onSaved={async () => { setEditingDept(null); await refreshAll() }}
        />
      )}
    </div>
  )
}

function CompanyForm({ initial, templates, onClose, onSaved }: { initial: Partial<Company>; templates: { id: number; name: string }[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(initial.name ?? '')
  const [cnpj, setCnpj] = useState(initial.cnpj ?? '')
  const [notes, setNotes] = useState(initial.notes ?? '')
  const [defaultTemplateId, setDefaultTemplateId] = useState<number | null>(initial.defaultTemplateId ?? null)
  const [logo, setLogo] = useState<string | null | undefined>(undefined) // undefined = não alterar
  const [logoPreview, setLogoPreview] = useState<string | null>(initial.logoUrl ?? null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const body = { name, cnpj: cnpj || null, notes: notes || null, defaultTemplateId, ...(logo !== undefined ? { logoDataUrl: logo } : {}) }
      if (initial.id) await companiesApi.update(initial.id, body)
      else await companiesApi.create(body)
      await onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={initial.id ? 'Editar empresa' : 'Nova empresa'} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <label>Nome<input value={name} onChange={(e) => setName(e.target.value)} required autoFocus /></label>
        <div className="grid cols-2">
          <label>CNPJ (opcional)<input value={cnpj} onChange={(e) => setCnpj(e.target.value)} /></label>
          <label>
            Modelo de cartão padrão
            <select value={defaultTemplateId ?? ''} onChange={(e) => setDefaultTemplateId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">— nenhum —</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
        </div>
        <label>
          Logo (PNG com fundo transparente recomendado)
          <div className="row">
            {logoPreview ? <img src={logoPreview} alt="" className="thumb" style={{ width: 120, height: 60 }} /> : <span className="muted small">Sem logo</span>}
            <FilePicker accept="image/*" onFile={async (f) => { const d = await fileToDataUrl(f); setLogo(d); setLogoPreview(d) }}>Escolher…</FilePicker>
            {logoPreview && <button type="button" className="btn small ghost" onClick={() => { setLogo(null); setLogoPreview(null) }}>Remover</button>}
          </div>
        </label>
        <label>Observações<textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} /></label>
        {error && <div className="alert error">{error}</div>}
        <div className="row end">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </form>
    </Modal>
  )
}

function DepartmentForm({ initial, templates, onClose, onSaved }: { initial: Partial<Department>; templates: { id: number; name: string }[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(initial.name ?? '')
  const [color, setColor] = useState(initial.color ?? '#1f5fbf')
  const [useColor, setUseColor] = useState(!!initial.color)
  const [defaultTemplateId, setDefaultTemplateId] = useState<number | null>(initial.defaultTemplateId ?? null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const body = { name, color: useColor ? color : null, defaultTemplateId }
      if (initial.id) await departmentsApi.update(initial.id, body)
      else await departmentsApi.create({ companyId: initial.companyId!, ...body })
      await onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={initial.id ? 'Editar departamento' : 'Novo departamento'} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <label>Nome<input value={name} onChange={(e) => setName(e.target.value)} required autoFocus /></label>
        <label>
          Modelo de cartão padrão do departamento
          <select value={defaultTemplateId ?? ''} onChange={(e) => setDefaultTemplateId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">— herdar da empresa —</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <div className="row">
          <label className="inline"><input type="checkbox" checked={useColor} onChange={(e) => setUseColor(e.target.checked)} /> Cor de identificação</label>
          {useColor && <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 60 }} />}
        </div>
        {error && <div className="alert error">{error}</div>}
        <div className="row end">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </form>
    </Modal>
  )
}
