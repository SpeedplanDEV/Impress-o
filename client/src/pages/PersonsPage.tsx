import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { companiesApi, departmentsApi, personsApi, templatesApi, fileToText, type PersonInput } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import Modal from '../components/Modal'
import PhotoCropper from '../components/PhotoCropper'
import FilePicker from '../components/FilePicker'
import { formatDate } from '../lib/format'
import type { Person } from '../lib/types'

export default function PersonsPage() {
  const [q, setQ] = useState('')
  const [companyId, setCompanyId] = useState<number | null>(null)
  const [departmentId, setDepartmentId] = useState<number | null>(null)
  const companies = useAsync(() => companiesApi.list())
  const departments = useAsync(() => departmentsApi.list(companyId), [companyId])
  const templates = useAsync(() => templatesApi.list())
  const persons = useAsync(() => personsApi.list({ q, companyId, departmentId }), [q, companyId, departmentId])
  const [editing, setEditing] = useState<Partial<Person> | null>(null)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function remove(p: Person) {
    if (!confirm(`Excluir "${p.fullName}"?`)) return
    try {
      await personsApi.remove(p.id)
      await persons.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Pessoas</h1>
        <div className="btn-group">
          <button className="btn" onClick={() => setImporting(true)}>Importar CSV</button>
          <button className="btn primary" onClick={() => setEditing({ companyId, departmentId })}>+ Nova pessoa</button>
        </div>
      </div>
      {error && <div className="alert error">{error}</div>}
      <div className="card">
        <div className="row" style={{ marginBottom: 12 }}>
          <input placeholder="Buscar por nome, matrícula ou cargo…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 320 }} />
          <select value={companyId ?? ''} onChange={(e) => { setCompanyId(e.target.value ? Number(e.target.value) : null); setDepartmentId(null) }} style={{ maxWidth: 240 }}>
            <option value="">Todas as empresas</option>
            {companies.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={departmentId ?? ''} onChange={(e) => setDepartmentId(e.target.value ? Number(e.target.value) : null)} style={{ maxWidth: 240 }}>
            <option value="">Todos os departamentos</option>
            {departments.data?.map((d) => <option key={d.id} value={d.id}>{companyId ? d.name : `${d.companyName} · ${d.name}`}</option>)}
          </select>
          <span className="muted small">{persons.data ? `${persons.data.length} pessoa(s)` : ''}</span>
        </div>
        {persons.error && <div className="alert error">{persons.error}</div>}
        {persons.data?.length === 0 && <div className="empty">Nenhuma pessoa encontrada. Cadastre uma pessoa ou importe um CSV.</div>}
        {persons.data && persons.data.length > 0 && (
          <table>
            <thead><tr><th>Foto</th><th>Nome</th><th>Cargo</th><th>Empresa / departamento</th><th>Matrícula</th><th>Validade</th><th></th></tr></thead>
            <tbody>
              {persons.data.map((p) => (
                <tr key={p.id}>
                  <td>{p.photoUrl ? <img src={p.photoUrl} alt="" className="photo-3x4" style={{ width: 36, height: 48 }} /> : <span className="photo-3x4" style={{ width: 36, height: 48, display: 'inline-block' }} />}</td>
                  <td>
                    <div>{p.fullName}{!p.active && <span className="badge warn" style={{ marginLeft: 6 }}>inativo</span>}</div>
                    {p.displayName && p.displayName !== p.fullName && <div className="small muted">{p.displayName}</div>}
                  </td>
                  <td>{p.roleTitle ?? '—'}</td>
                  <td>{p.companyName ?? '—'}{p.departmentName ? ` · ${p.departmentName}` : ''}</td>
                  <td>{p.registration ?? '—'}</td>
                  <td>{formatDate(p.validUntil)}</td>
                  <td className="num">
                    <div className="btn-group">
                      <Link className="btn small" to={`/impressao?pessoa=${p.id}`}>Imprimir</Link>
                      <button className="btn small" onClick={() => setEditing(p)}>Editar</button>
                      <button className="btn small danger" onClick={() => void remove(p)}>Excluir</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <PersonForm
          initial={editing}
          companies={companies.data ?? []}
          templates={templates.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await persons.reload() }}
        />
      )}
      {importing && (
        <ImportCsvModal
          companies={companies.data ?? []}
          onClose={() => setImporting(false)}
          onDone={async () => { setImporting(false); await persons.reload(); await companies.reload() }}
        />
      )}
    </div>
  )
}

function PersonForm({ initial, companies, templates, onClose, onSaved }: {
  initial: Partial<Person>
  companies: { id: number; name: string }[]
  templates: { id: number; name: string; companyId: number | null }[]
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [form, setForm] = useState<PersonInput>({
    fullName: initial.fullName ?? '',
    displayName: initial.displayName ?? '',
    roleTitle: initial.roleTitle ?? '',
    registration: initial.registration ?? '',
    document: initial.document ?? '',
    email: initial.email ?? '',
    phone: initial.phone ?? '',
    validUntil: initial.validUntil ?? '',
    companyId: initial.companyId ?? null,
    departmentId: initial.departmentId ?? null,
    templateId: initial.templateId ?? null,
    active: initial.active ?? true,
    extra: initial.extra ?? {},
  })
  const [photo, setPhoto] = useState<string | null | undefined>(undefined)
  const [photoPreview, setPhotoPreview] = useState<string | null>(initial.photoUrl ?? null)
  const [cropping, setCropping] = useState(false)
  const [extraKey, setExtraKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const departments = useAsync(() => departmentsApi.list(form.companyId ?? null), [form.companyId])

  useEffect(() => {
    // Se o departamento não pertence à empresa, limpa
    if (form.departmentId && departments.data && !departments.data.some((d) => d.id === form.departmentId)) {
      setForm((f) => ({ ...f, departmentId: null }))
    }
  }, [departments.data, form.departmentId])

  const set = <K extends keyof PersonInput>(k: K, v: PersonInput[K]) => setForm((f) => ({ ...f, [k]: v }))
  const templateOptions = useMemo(() => templates.filter((t) => !t.companyId || t.companyId === form.companyId), [templates, form.companyId])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const body: Partial<PersonInput> = {
        ...form,
        displayName: form.displayName || null,
        roleTitle: form.roleTitle || null,
        registration: form.registration || null,
        document: form.document || null,
        email: form.email || null,
        phone: form.phone || null,
        validUntil: form.validUntil || null,
        ...(photo !== undefined ? { photoDataUrl: photo } : {}),
      }
      if (initial.id) await personsApi.update(initial.id, body)
      else await personsApi.create(body as PersonInput)
      await onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={initial.id ? 'Editar pessoa' : 'Nova pessoa'} onClose={onClose} wide>
      <form onSubmit={submit}>
        <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 18 }}>
          <div className="stack" style={{ alignItems: 'center' }}>
            {photoPreview ? <img src={photoPreview} alt="Foto 3x4" className="photo-3x4" style={{ width: 135, height: 180 }} /> : <div className="photo-3x4" style={{ width: 135, height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="muted small">Sem foto</span></div>}
            <button type="button" className="btn small" onClick={() => setCropping(true)}>{photoPreview ? 'Trocar foto 3x4' : 'Adicionar foto 3x4'}</button>
            {photoPreview && <button type="button" className="btn small ghost" onClick={() => { setPhoto(null); setPhotoPreview(null) }}>Remover foto</button>}
          </div>
          <div className="stack">
            <div className="grid cols-2">
              <label>Nome completo<input value={form.fullName} onChange={(e) => set('fullName', e.target.value)} required autoFocus maxLength={200} /></label>
              <label>Nome no cartão (opcional)<input value={form.displayName ?? ''} onChange={(e) => set('displayName', e.target.value)} placeholder="Ex.: nome abreviado" /></label>
              <label>Cargo / função<input value={form.roleTitle ?? ''} onChange={(e) => set('roleTitle', e.target.value)} /></label>
              <label>Matrícula<input value={form.registration ?? ''} onChange={(e) => set('registration', e.target.value)} /></label>
              <label>
                Empresa
                <select value={form.companyId ?? ''} onChange={(e) => set('companyId', e.target.value ? Number(e.target.value) : null)}>
                  <option value="">— sem empresa —</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label>
                Departamento
                <select value={form.departmentId ?? ''} onChange={(e) => set('departmentId', e.target.value ? Number(e.target.value) : null)} disabled={!form.companyId}>
                  <option value="">— sem departamento —</option>
                  {departments.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </label>
              <label>Documento (CPF/RG)<input value={form.document ?? ''} onChange={(e) => set('document', e.target.value)} /></label>
              <label>Validade do cartão<input type="date" value={form.validUntil ?? ''} onChange={(e) => set('validUntil', e.target.value)} /></label>
              <label>E-mail<input value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} /></label>
              <label>Telefone<input value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} /></label>
              <label>
                Modelo de cartão específico
                <select value={form.templateId ?? ''} onChange={(e) => set('templateId', e.target.value ? Number(e.target.value) : null)}>
                  <option value="">— usar o padrão do departamento/empresa —</option>
                  {templateOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
              <label className="inline" style={{ alignSelf: 'end' }}><input type="checkbox" checked={form.active ?? true} onChange={(e) => set('active', e.target.checked)} /> Ativo</label>
            </div>
            <fieldset>
              <legend>Campos extras (usáveis no modelo como {'{{nome_do_campo}}'})</legend>
              <div className="stack">
                {Object.entries(form.extra ?? {}).map(([k, v]) => (
                  <div className="row" key={k}>
                    <code className="mono" style={{ minWidth: 140 }}>{`{{${k}}}`}</code>
                    <input value={v} onChange={(e) => set('extra', { ...(form.extra ?? {}), [k]: e.target.value })} />
                    <button type="button" className="btn small ghost" onClick={() => { const ex = { ...(form.extra ?? {}) }; delete ex[k]; set('extra', ex) }}>✕</button>
                  </div>
                ))}
                <div className="row">
                  <input placeholder="nome do campo (ex.: tipo_sanguineo)" value={extraKey} onChange={(e) => setExtraKey(e.target.value.replace(/[^\w]/g, '_').toLowerCase())} style={{ maxWidth: 260 }} />
                  <button type="button" className="btn small" onClick={() => { if (extraKey) { set('extra', { ...(form.extra ?? {}), [extraKey]: '' }); setExtraKey('') } }}>+ Adicionar campo</button>
                </div>
              </div>
            </fieldset>
          </div>
        </div>
        {error && <div className="alert error">{error}</div>}
        <div className="row end" style={{ marginTop: 14 }}>
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </form>
      {cropping && <PhotoCropper onClose={() => setCropping(false)} onDone={(d) => { setPhoto(d); setPhotoPreview(d); setCropping(false) }} />}
    </Modal>
  )
}

function ImportCsvModal({ companies, onClose, onDone }: { companies: { id: number; name: string }[]; onClose: () => void; onDone: () => Promise<void> }) {
  const [csv, setCsv] = useState('')
  const [companyId, setCompanyId] = useState<number | null>(null)
  const [createDepartments, setCreateDepartments] = useState(true)
  const [result, setResult] = useState<{ imported: number; createdDepartments: number; errors: string[]; warnings: string[]; extraColumns: string[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function run() {
    setBusy(true)
    setError(null)
    try {
      setResult(await personsApi.importCsv({ csv, companyId, createDepartments }))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Importar pessoas de um CSV" onClose={onClose} footer={
      result ? <button className="btn primary" onClick={() => void onDone()}>Concluir</button> : (
        <>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" onClick={() => void run()} disabled={!csv.trim() || busy}>{busy ? 'Importando…' : 'Importar'}</button>
        </>
      )
    }>
      <p className="small muted">
        Colunas reconhecidas (cabeçalho na primeira linha, separador vírgula, ponto e vírgula ou tabulação): <strong>nome</strong> (obrigatória), cargo, departamento, empresa, matrícula, documento, email, telefone, validade (dd/mm/aaaa). Colunas extras viram campos extras da pessoa.
      </p>
      <div className="row" style={{ marginBottom: 10 }}>
        <FilePicker className="btn" accept=".csv,text/csv,text/plain" onFile={async (f) => setCsv(await fileToText(f))}>Escolher arquivo .csv…</FilePicker>
        <select value={companyId ?? ''} onChange={(e) => setCompanyId(e.target.value ? Number(e.target.value) : null)} style={{ maxWidth: 260 }}>
          <option value="">Empresa: usar a coluna "empresa"</option>
          {companies.map((c) => <option key={c.id} value={c.id}>Empresa: {c.name}</option>)}
        </select>
        <label className="inline"><input type="checkbox" checked={createDepartments} onChange={(e) => setCreateDepartments(e.target.checked)} /> Criar empresas/departamentos que não existirem</label>
      </div>
      <textarea value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={'nome;cargo;departamento;matrícula\nMaria Souza;Gerente;Financeiro;100'} style={{ minHeight: 160 }} className="mono" />
      {error && <div className="alert error">{error}</div>}
      {result && (
        <div className="alert success">
          {result.imported} pessoa(s) importada(s); {result.createdDepartments} departamento(s) criado(s).
          {result.extraColumns.length > 0 && <div className="small">Campos extras (use no modelo): {result.extraColumns.map((c) => `{{${c}}}`).join(', ')}</div>}
          {result.warnings.length > 0 && <ul className="small">{result.warnings.map((e, i) => <li key={i}>{e}</li>)}</ul>}
          {result.errors.length > 0 && <ul className="small">{result.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
        </div>
      )}
    </Modal>
  )
}
