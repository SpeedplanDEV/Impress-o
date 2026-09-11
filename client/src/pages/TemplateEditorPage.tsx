import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { cardsApi, templatesApi, downloadBlob } from '../lib/api'
import CardEditor from '../editor/CardEditor'
import { renderThumbnail, renderCardForPrint } from '../editor/render'
import type { CardTemplateDoc, CardData } from '@shared/template'
import type { TemplateFull } from '../lib/types'

export default function TemplateEditorPage() {
  const { id } = useParams()
  const templateId = Number(id)
  const [template, setTemplate] = useState<TemplateFull | null>(null)
  const [doc, setDoc] = useState<CardTemplateDoc | null>(null)
  const [name, setName] = useState('')
  const [sample, setSample] = useState<CardData | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const docRef = useRef<CardTemplateDoc | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const t = await templatesApi.get(templateId)
        if (cancelled) return
        setTemplate(t)
        setDoc(t.design)
        docRef.current = t.design
        setName(t.name)
        setSample(await cardsApi.sample())
      } catch (err) {
        setMessage({ kind: 'error', text: err instanceof Error ? err.message : String(err) })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [templateId])

  const onChange = useCallback((d: CardTemplateDoc) => {
    docRef.current = d
    setDoc(d)
    setDirty(true)
  }, [])

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  async function save() {
    const d = docRef.current
    if (!d) return
    setSaving(true)
    setMessage(null)
    try {
      const design = { ...d, name }
      const thumbnail = await renderThumbnail(design).catch(() => null)
      const t = await templatesApi.update(templateId, { name, design, thumbnail })
      setTemplate(t)
      setDirty(false)
      setMessage({ kind: 'success', text: 'Modelo salvo.' })
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : String(err) })
    } finally {
      setSaving(false)
    }
  }

  async function exportPng() {
    const d = docRef.current
    if (!d || !sample) return
    const r = await renderCardForPrint(d, sample)
    downloadBlob(r.front, `${name || 'modelo'}-frente.png`)
    if (r.back) downloadBlob(r.back, `${name || 'modelo'}-verso.png`)
  }

  if (!doc || !template) return <div className="muted">{message ? <div className="alert error">{message.text}</div> : 'Carregando modelo…'}</div>

  return (
    <div>
      <div className="page-header">
        <div className="row">
          <Link to="/modelos" className="btn ghost">← Modelos</Link>
          <input value={name} onChange={(e) => { setName(e.target.value); setDirty(true) }} style={{ fontSize: 18, fontWeight: 600, width: 360 }} />
          {dirty && <span className="badge warn">alterações não salvas</span>}
        </div>
        <div className="btn-group">
          <a className="btn" href={templatesApi.exportUrl(templateId)} download>Exportar .json</a>
          <button className="btn" onClick={() => void exportPng()}>Exportar PNG (exemplo)</button>
          <button className="btn primary" onClick={() => void save()} disabled={saving}>{saving ? 'Salvando…' : 'Salvar modelo'}</button>
        </div>
      </div>
      {message && <div className={`alert ${message.kind}`}>{message.text}</div>}
      <CardEditor doc={doc} onChange={onChange} sampleData={sample} />
    </div>
  )
}
