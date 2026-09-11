import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { companiesApi, departmentsApi, templatesApi, fileToText } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import Modal from '../components/Modal'
import { emptyTemplateDoc } from '@shared/template'
import { renderThumbnail } from '../editor/render'
import type { TemplateFull } from '../lib/types'
import { formatDateTime } from '../lib/format'
import type { TemplateSummary } from '../lib/types'

/** Gera e grava a miniatura de um modelo recém-criado (o editor também faz isso ao salvar). */
async function ensureThumbnail(t: TemplateFull): Promise<void> {
  try {
    const thumbnail = await renderThumbnail(t.design)
    await templatesApi.update(t.id, { thumbnail })
  } catch {
    /* miniatura é opcional */
  }
}

export default function TemplatesPage() {
  const navigate = useNavigate()
  const templates = useAsync(() => templatesApi.list())
  const builtin = useAsync(() => templatesApi.builtin())
  const companies = useAsync(() => companiesApi.list())
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)
  const [assigning, setAssigning] = useState<TemplateSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function installBuiltin(key: string) {
    try {
      const t = await templatesApi.installBuiltin(key)
      await ensureThumbnail(t)
      navigate(`/modelos/${t.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }
  async function duplicate(t: TemplateSummary) {
    try {
      await templatesApi.duplicate(t.id)
      await templates.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }
  async function remove(t: TemplateSummary) {
    if (!confirm(`Excluir o modelo "${t.name}"?`)) return
    try {
      await templatesApi.remove(t.id)
      await templates.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Modelos de cartão</h1>
        <div className="btn-group">
          <button className="btn" onClick={() => setImporting(true)}>Importar modelo (.json)</button>
          <button className="btn primary" onClick={() => setCreating(true)}>+ Novo modelo</button>
        </div>
      </div>
      {error && <div className="alert error">{error}</div>}
      <div className="card">
        <h2>Meus modelos</h2>
        {templates.data?.length === 0 && <div className="empty">Nenhum modelo ainda. Comece por um modelo pronto abaixo, crie um em branco ou importe um arquivo.</div>}
        <div className="template-grid">
          {templates.data?.map((t) => (
            <div key={t.id} className={`card template-card ${t.orientation}`} onClick={() => navigate(`/modelos/${t.id}`)}>
              {t.thumbnail ? <img src={t.thumbnail} alt="" /> : <div className="empty" style={{ aspectRatio: t.orientation === 'landscape' ? '85.6/54' : '54/85.6', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>Sem miniatura</div>}
              <div style={{ marginTop: 8 }}>
                <strong>{t.name}</strong>
                <div className="small muted">
                  {t.companyName ?? 'Todas as empresas'}{t.departmentName ? ` · ${t.departmentName}` : ''} · {t.orientation === 'landscape' ? 'paisagem' : 'retrato'}{t.doubleSided ? ' · frente e verso' : ''}
                </div>
                <div className="small muted">Atualizado em {formatDateTime(t.updatedAt)}</div>
              </div>
              <div className="btn-group" style={{ marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
                <button className="btn small" onClick={() => navigate(`/modelos/${t.id}`)}>Editar</button>
                <button className="btn small" onClick={() => setAssigning(t)}>Vincular</button>
                <button className="btn small" onClick={() => void duplicate(t)}>Duplicar</button>
                <a className="btn small" href={templatesApi.exportUrl(t.id)} download>Exportar</a>
                <button className="btn small danger" onClick={() => void remove(t)}>Excluir</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Modelos prontos</h2>
        <p className="small muted">Instale um modelo pronto e personalize no editor.</p>
        <div className="template-grid">
          {builtin.data?.map((b) => (
            <div key={b.key} className="card">
              <strong>{b.name}</strong>
              <div className="small muted" style={{ margin: '6px 0 10px' }}>{b.description}</div>
              <button className="btn small primary" onClick={() => void installBuiltin(b.key)}>Usar este modelo</button>
            </div>
          ))}
        </div>
      </div>

      {creating && (
        <NewTemplateModal
          companies={companies.data ?? []}
          onClose={() => setCreating(false)}
          onCreated={(id) => navigate(`/modelos/${id}`)}
        />
      )}
      {importing && (
        <ImportTemplateModal
          companies={companies.data ?? []}
          onClose={() => setImporting(false)}
          onImported={(id) => navigate(`/modelos/${id}`)}
        />
      )}
      {assigning && (
        <AssignModal
          template={assigning}
          companies={companies.data ?? []}
          onClose={() => setAssigning(null)}
          onSaved={async () => { setAssigning(null); await templates.reload() }}
        />
      )}
    </div>
  )
}

function CompanyDeptPicker({ companies, companyId, departmentId, onChange }: {
  companies: { id: number; name: string }[]
  companyId: number | null
  departmentId: number | null
  onChange: (companyId: number | null, departmentId: number | null) => void
}) {
  const departments = useAsync(() => (companyId ? departmentsApi.list(companyId) : Promise.resolve([])), [companyId])
  return (
    <div className="grid cols-2">
      <label>
        Empresa
        <select value={companyId ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null, null)}>
          <option value="">Todas as empresas</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label>
        Departamento
        <select value={departmentId ?? ''} onChange={(e) => onChange(companyId, e.target.value ? Number(e.target.value) : null)} disabled={!companyId}>
          <option value="">Todos os departamentos</option>
          {departments.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </label>
    </div>
  )
}

function NewTemplateModal({ companies, onClose, onCreated }: { companies: { id: number; name: string }[]; onClose: () => void; onCreated: (id: number) => void }) {
  const [name, setName] = useState('')
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('landscape')
  const [companyId, setCompanyId] = useState<number | null>(null)
  const [departmentId, setDepartmentId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  async function create() {
    try {
      const t = await templatesApi.create({ name, companyId, departmentId, design: emptyTemplateDoc(name, orientation) })
      await ensureThumbnail(t)
      onCreated(t.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }
  return (
    <Modal title="Novo modelo" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={!name.trim()} onClick={() => void create()}>Criar e abrir o editor</button></>}>
      <div className="stack">
        <label>Nome do modelo<input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Ex.: Crachá Financeiro" /></label>
        <label>
          Orientação
          <select value={orientation} onChange={(e) => setOrientation(e.target.value as 'landscape' | 'portrait')}>
            <option value="landscape">Paisagem (85,6 × 54 mm)</option>
            <option value="portrait">Retrato (54 × 85,6 mm)</option>
          </select>
        </label>
        <CompanyDeptPicker companies={companies} companyId={companyId} departmentId={departmentId} onChange={(c, d) => { setCompanyId(c); setDepartmentId(d) }} />
        {error && <div className="alert error">{error}</div>}
      </div>
    </Modal>
  )
}

function ImportTemplateModal({ companies, onClose, onImported }: { companies: { id: number; name: string }[]; onClose: () => void; onImported: (id: number) => void }) {
  const [design, setDesign] = useState<unknown>(null)
  const [fileName, setFileName] = useState('')
  const [name, setName] = useState('')
  const [companyId, setCompanyId] = useState<number | null>(null)
  const [departmentId, setDepartmentId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  async function onFile(f: File) {
    setError(null)
    try {
      const parsed = JSON.parse(await fileToText(f)) as { name?: string }
      setDesign(parsed)
      setFileName(f.name)
      if (parsed?.name) setName((n) => n || String(parsed.name))
    } catch {
      setError('O arquivo não é um JSON válido.')
    }
  }
  async function run() {
    try {
      const t = await templatesApi.import({ design, name: name || undefined, companyId, departmentId })
      await ensureThumbnail(t)
      onImported(t.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }
  return (
    <Modal title="Importar modelo" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={!design} onClick={() => void run()}>Importar</button></>}>
      <div className="stack">
        <p className="small muted">Importa arquivos <code>.impresso.json</code> exportados por este sistema (menu Exportar de um modelo). Para usar uma arte pronta (PNG/JPG) como base, crie um modelo em branco e use "Imagem de fundo" no editor.</p>
        <label className="btn">
          Escolher arquivo…
          <input type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = '' }} />
        </label>
        {fileName && <div className="small">Arquivo: {fileName}</div>}
        <label>Nome (opcional)<input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <CompanyDeptPicker companies={companies} companyId={companyId} departmentId={departmentId} onChange={(c, d) => { setCompanyId(c); setDepartmentId(d) }} />
        {error && <div className="alert error">{error}</div>}
      </div>
    </Modal>
  )
}

function AssignModal({ template, companies, onClose, onSaved }: { template: TemplateSummary; companies: { id: number; name: string }[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [companyId, setCompanyId] = useState<number | null>(template.companyId)
  const [departmentId, setDepartmentId] = useState<number | null>(template.departmentId)
  const [setAsDefault, setSetAsDefault] = useState(true)
  const [error, setError] = useState<string | null>(null)
  async function save() {
    try {
      await templatesApi.update(template.id, { companyId, departmentId })
      if (setAsDefault) {
        if (departmentId) await departmentsApi.update(departmentId, { defaultTemplateId: template.id })
        else if (companyId) await companiesApi.update(companyId, { defaultTemplateId: template.id })
      }
      await onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }
  return (
    <Modal title={`Vincular "${template.name}"`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={() => void save()}>Salvar</button></>}>
      <div className="stack">
        <p className="small muted">Vincule o modelo a uma empresa e/ou departamento. Ao imprimir, o sistema usa o modelo da pessoa, senão o padrão do departamento, senão o padrão da empresa.</p>
        <CompanyDeptPicker companies={companies} companyId={companyId} departmentId={departmentId} onChange={(c, d) => { setCompanyId(c); setDepartmentId(d) }} />
        <label className="inline"><input type="checkbox" checked={setAsDefault} onChange={(e) => setSetAsDefault(e.target.checked)} disabled={!companyId} /> Definir como modelo padrão {departmentId ? 'do departamento' : 'da empresa'}</label>
        {error && <div className="alert error">{error}</div>}
      </div>
    </Modal>
  )
}
