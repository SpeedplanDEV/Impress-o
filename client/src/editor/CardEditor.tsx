/**
 * Editor visual de layout do cartão (Fabric.js v7).
 *
 * - Espaço de desenho no tamanho real de impressão (px a 300 dpi); zoom só na exibição.
 * - Elementos com "papel": foto 3x4, logo, nome, campo dinâmico, QR, ou estático.
 * - Frente e verso, imagem de fundo, camadas, alinhamento, desfazer/refazer.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, FabricImage, FabricObject, IText, Rect, Textbox, Circle, Line, Point } from 'fabric'
import { CR80, PHOTO_3X4, mmToPx, pxToMm } from '@shared/card'
import { DYNAMIC_FIELDS, EXTRA_PROPS, FIELD_LABELS, type CardData, type CardSideDesign, type CardTemplateDoc, type ElementMeta, type ElementRole } from '@shared/template'
import { loadSideIntoCanvas, metaOf, setMeta, serializeCanvas } from './render'
import { fileToDataUrl } from '../lib/api'
import FilePicker from '../components/FilePicker'

const FONTS = ['Arial', 'Helvetica', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Segoe UI', 'Calibri', 'Georgia', 'Times New Roman', 'Courier New', 'Impact']
const ROLE_LABELS: Record<ElementRole, string> = {
  static: 'Estático',
  photo: 'Foto 3x4',
  name: 'Nome',
  logo: 'Logo da empresa',
  field: 'Campo dinâmico',
  qr: 'QR code',
  barcode: 'Código de barras',
}

type Side = 'front' | 'back'

interface Props {
  doc: CardTemplateDoc
  /** Chamado a cada alteração relevante com o documento atualizado. */
  onChange: (doc: CardTemplateDoc) => void
  /** Dados de exemplo para pré-visualização. */
  sampleData?: CardData | null
}

let uid = 0
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(uid++).toString(36)}`

export default function CardEditor({ doc, onChange, sampleData }: Props) {
  const canvasElRef = useRef<HTMLCanvasElement | null>(null)
  const canvasRef = useRef<Canvas | null>(null)
  const [side, setSide] = useState<Side>('front')
  const [zoom, setZoom] = useState(0.6)
  const [selected, setSelected] = useState<FabricObject | null>(null)
  const [, forceRender] = useState(0)
  const [preview, setPreview] = useState(false)
  const [warnings, setWarnings] = useState<string[]>([])
  const undoStack = useRef<string[]>([])
  const redoStack = useRef<string[]>([])
  const loadingRef = useRef(false)
  const docRef = useRef(doc)
  docRef.current = doc
  const sideRef = useRef(side)
  sideRef.current = side
  const previewRef = useRef(preview)
  previewRef.current = preview
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  const sampleRef = useRef(sampleData)
  sampleRef.current = sampleData
  const loadToken = useRef(0)
  const abortRef = useRef<AbortController | null>(null)

  const currentSide: CardSideDesign = side === 'back' && doc.back ? doc.back : doc.front
  const bump = () => forceRender((n) => n + 1)

  /** Serializa o canvas atual de volta para o documento. */
  const commit = useCallback(
    (pushUndo = true) => {
      const canvas = canvasRef.current
      // Em modo de pré-visualização o canvas contém dados de exemplo: nunca gravar no modelo
      if (!canvas || loadingRef.current || previewRef.current) return
      const fabric = serializeCanvas(canvas)
      const bg = typeof canvas.backgroundColor === 'string' ? canvas.backgroundColor : '#ffffff'
      const sideDesign: CardSideDesign = { fabric, backgroundColor: bg }
      const d = docRef.current
      const next: CardTemplateDoc = sideRef.current === 'back' ? { ...d, back: sideDesign } : { ...d, front: sideDesign }
      if (pushUndo) {
        undoStack.current.push(JSON.stringify(d))
        if (undoStack.current.length > 60) undoStack.current.shift()
        redoStack.current = []
      }
      onChange(next)
    },
    [onChange],
  )

  /* ---------------- Ciclo de vida do canvas ---------------- */
  useEffect(() => {
    const el = canvasElRef.current
    if (!el) return
    const canvas = new Canvas(el, {
      width: doc.width,
      height: doc.height,
      preserveObjectStacking: true,
      uniformScaling: true,
      selection: true,
      backgroundColor: '#ffffff',
      enableRetinaScaling: true,
    })
    canvasRef.current = canvas
    const onSel = () => {
      const objs = canvas.getActiveObjects()
      setSelected(objs.length === 1 ? objs[0] : null)
    }
    const onModified = () => commit()
    canvas.on('selection:created', onSel)
    canvas.on('selection:updated', onSel)
    canvas.on('selection:cleared', () => setSelected(null))
    canvas.on('object:modified', onModified)
    canvas.on('text:changed', () => {
      const t = canvas.getActiveObject()
      if (t && (t instanceof Textbox || t instanceof IText)) {
        const m = metaOf(t)
        if (m.role === 'field' || m.role === 'name') setMeta(t, { textTemplate: t.text })
      }
    })
    canvas.on('text:editing:exited', () => commit())
    // Rótulos dos espaços (foto, logo, QR) só na tela do editor; nunca vão para a impressão
    canvas.on('after:render', ({ ctx }) => {
      if (previewRef.current) return
      const vpt = canvas.viewportTransform
      for (const obj of canvas.getObjects()) {
        const m = metaOf(obj)
        if (m.role !== 'photo' && m.role !== 'logo' && m.role !== 'qr') continue
        const c = obj.getCenterPoint()
        const x = c.x * vpt[0] + vpt[4]
        const y = c.y * vpt[3] + vpt[5]
        const label = m.role === 'photo' ? 'FOTO 3x4' : m.role === 'logo' ? 'LOGO' : 'QR'
        const size = Math.max(10, Math.min(16, obj.getScaledWidth() * vpt[0] * 0.12))
        ctx.save()
        ctx.font = `600 ${size}px "Segoe UI", system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = 'rgba(31, 41, 51, 0.55)'
        ctx.fillText(label, x, y)
        ctx.restore()
      }
    })
    return () => {
      canvas.dispose()
      canvasRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---------------- Carrega o lado atual ---------------- */
  const reload = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const token = ++loadToken.current
    loadingRef.current = true
    try {
      const d = docRef.current
      const s = sideRef.current === 'back' && d.back ? d.back : d.front
      const isPreview = previewRef.current
      const w = await loadSideIntoCanvas(canvas, s, d, isPreview ? { data: sampleRef.current ?? { fields: {} }, showPlaceholders: true, signal: controller.signal } : { signal: controller.signal })
      if (token !== loadToken.current || (canvas as unknown as { disposed?: boolean }).disposed) return
      setWarnings(w)
      for (const obj of canvas.getObjects()) decorate(obj, isPreview)
      const z = zoomRef.current
      canvas.setZoom(z)
      canvas.setDimensions({ width: d.width * z, height: d.height * z })
      canvas.discardActiveObject()
      setSelected(null)
      canvas.requestRenderAll()
    } finally {
      if (token === loadToken.current) loadingRef.current = false
    }
  }, [])

  // Recarrega quando muda o lado, a pré-visualização ou o documento externo (id/orientação)
  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side, preview, doc.width, doc.height, doc.doubleSided])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.setZoom(zoom)
    canvas.setDimensions({ width: doc.width * zoom, height: doc.height * zoom })
    canvas.requestRenderAll()
  }, [zoom, doc.width, doc.height])

  /* ---------------- Atalhos de teclado ---------------- */
  const handlersRef = useRef({ undo: () => {}, redo: () => {}, removeSelected: () => {}, duplicateSelected: async () => {} })
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const canvas = canvasRef.current
      if (!canvas) return
      if (previewRef.current) return
      const { undo, redo, removeSelected, duplicateSelected } = handlersRef.current
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return
      const active = canvas.getActiveObject()
      if (active && (active as IText).isEditing) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && active) {
        e.preventDefault()
        removeSelected()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && active) {
        e.preventDefault()
        void duplicateSelected()
      } else if (active && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        if (e.key === 'ArrowUp') active.top -= step
        if (e.key === 'ArrowDown') active.top += step
        if (e.key === 'ArrowLeft') active.left -= step
        if (e.key === 'ArrowRight') active.left += step
        active.setCoords()
        canvas.requestRenderAll()
        commit()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---------------- Ações ---------------- */
  function addObject(obj: FabricObject, meta?: Partial<ElementMeta>) {
    const canvas = canvasRef.current
    if (!canvas || previewRef.current) return
    if (meta) setMeta(obj, { elementId: newId(meta.role ?? 'el'), ...meta })
    else setMeta(obj, { role: 'static', elementId: newId('el') })
    decorate(obj, false)
    canvas.add(obj)
    canvas.setActiveObject(obj)
    canvas.requestRenderAll()
    commit()
  }

  function addText(role: 'static' | 'name' | 'field', field?: string) {
    const template = role === 'name' ? '{{display_name}}' : role === 'field' ? `{{${field ?? 'role_title'}}}` : 'Texto'
    const t = new Textbox(template, {
      originX: 'left',
      originY: 'top',
      left: 60,
      top: 60,
      width: Math.min(600, doc.width - 120),
      fontSize: role === 'name' ? 48 : 30,
      fontFamily: 'Arial',
      fontWeight: role === 'name' ? 'bold' : 'normal',
      fill: '#1f2933',
    })
    addObject(t, { role, field: role === 'name' ? 'display_name' : field, textTemplate: template, label: role === 'name' ? 'Nome' : role === 'field' ? FIELD_LABELS[(field ?? 'role_title') as keyof typeof FIELD_LABELS] ?? field : 'Texto' })
  }

  function addPhotoSlot() {
    const w = PHOTO_3X4.widthPx
    const r = new Rect({ originX: 'left', originY: 'top', left: 60, top: 60, width: w, height: Math.round((w * 4) / 3), fill: '#dfe6ee', stroke: '#9aa8b8', strokeWidth: 2, strokeDashArray: [10, 8], rx: 12, ry: 12 })
    addObject(r, { role: 'photo', fit: 'cover', label: 'Foto 3x4' })
  }
  function addLogoSlot() {
    const r = new Rect({ originX: 'left', originY: 'top', left: 60, top: 60, width: 300, height: 100, fill: 'rgba(31,95,191,0.08)', stroke: '#9aa8b8', strokeWidth: 2, strokeDashArray: [10, 8] })
    addObject(r, { role: 'logo', fit: 'contain', label: 'Logo da empresa' })
  }
  function addQr() {
    const r = new Rect({ originX: 'left', originY: 'top', left: 60, top: 60, width: 160, height: 160, fill: '#ffffff', stroke: '#9aa8b8', strokeWidth: 2, strokeDashArray: [10, 8] })
    addObject(r, { role: 'qr', field: '{{registration}}', label: 'QR code' })
  }
  function addRect() {
    addObject(new Rect({ originX: 'left', originY: 'top', left: 60, top: 60, width: 300, height: 120, fill: '#1f5fbf', rx: 0, ry: 0 }), { role: 'static', label: 'Retângulo' })
  }
  function addCircle() {
    addObject(new Circle({ originX: 'left', originY: 'top', left: 60, top: 60, radius: 80, fill: '#1f5fbf' }), { role: 'static', label: 'Círculo' })
  }
  function addLine() {
    addObject(new Line([0, 0, 400, 0], { originX: 'left', originY: 'top', left: 60, top: 300, stroke: '#1f5fbf', strokeWidth: 6 }), { role: 'static', label: 'Linha' })
  }
  async function addImage(file: File) {
    const url = await fileToDataUrl(file)
    const img = await FabricImage.fromURL(url)
    if (!img.width || !img.height) {
      alert('Não foi possível ler as dimensões da imagem. Para SVG, garanta que o arquivo tenha width/height definidos ou converta para PNG.')
      return
    }
    const maxW = doc.width * 0.5
    const scale = Math.min(1, maxW / (img.width || 1))
    img.set({ originX: 'left', originY: 'top', left: 60, top: 60, scaleX: scale, scaleY: scale })
    addObject(img, { role: 'static', label: 'Imagem' })
  }
  async function setBackgroundImage(file: File | null) {
    const canvas = canvasRef.current
    if (!canvas) return
    if (!file) {
      canvas.backgroundImage = undefined
      canvas.requestRenderAll()
      commit()
      return
    }
    const url = await fileToDataUrl(file)
    const img = await FabricImage.fromURL(url)
    if (!img.width || !img.height) {
      alert('Não foi possível ler as dimensões da imagem de fundo. Use PNG ou JPG.')
      return
    }
    const scale = Math.max(doc.width / (img.width || 1), doc.height / (img.height || 1))
    img.set({ originX: 'center', originY: 'center', left: doc.width / 2, top: doc.height / 2, scaleX: scale, scaleY: scale })
    canvas.backgroundImage = img
    canvas.requestRenderAll()
    commit()
  }
  function setBackgroundColor(color: string) {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.backgroundColor = color
    canvas.requestRenderAll()
    commit()
  }
  function removeSelected() {
    const canvas = canvasRef.current
    if (!canvas) return
    const objs = canvas.getActiveObjects()
    if (!objs.length) return
    canvas.discardActiveObject()
    canvas.remove(...objs)
    canvas.requestRenderAll()
    setSelected(null)
    commit()
  }
  async function duplicateSelected() {
    const canvas = canvasRef.current
    const obj = canvas?.getActiveObject()
    if (!canvas || !obj) return
    const clone = await obj.clone(EXTRA_PROPS as string[])
    clone.set({ left: obj.left + 20, top: obj.top + 20 })
    setMeta(clone, { elementId: newId(metaOf(obj).role ?? 'el') })
    decorate(clone, false)
    canvas.add(clone)
    canvas.setActiveObject(clone)
    canvas.requestRenderAll()
    commit()
  }
  function layer(action: 'front' | 'back' | 'forward' | 'backward') {
    const canvas = canvasRef.current
    const obj = canvas?.getActiveObject()
    if (!canvas || !obj) return
    if (action === 'front') canvas.bringObjectToFront(obj)
    if (action === 'back') canvas.sendObjectToBack(obj)
    if (action === 'forward') canvas.bringObjectForward(obj)
    if (action === 'backward') canvas.sendObjectBackwards(obj)
    canvas.requestRenderAll()
    commit()
  }
  function align(where: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom') {
    const canvas = canvasRef.current
    const obj = canvas?.getActiveObject()
    if (!canvas || !obj) return
    const box = obj.getBoundingRect()
    const tl = obj.getPositionByOrigin('left', 'top')
    // Deslocamento entre a caixa envolvente (com rotação) e a posição top-left do objeto
    const dx = tl.x - box.left
    const dy = tl.y - box.top
    let x = box.left
    let y = box.top
    if (where === 'left') x = 0
    if (where === 'hcenter') x = (doc.width - box.width) / 2
    if (where === 'right') x = doc.width - box.width
    if (where === 'top') y = 0
    if (where === 'vcenter') y = (doc.height - box.height) / 2
    if (where === 'bottom') y = doc.height - box.height
    obj.setPositionByOrigin(new Point(x + dx, y + dy), 'left', 'top')
    obj.setCoords()
    canvas.requestRenderAll()
    commit()
  }
  function undo() {
    const prev = undoStack.current.pop()
    if (!prev) return
    redoStack.current.push(JSON.stringify(docRef.current))
    const d = JSON.parse(prev) as CardTemplateDoc
    onChange(d)
    docRef.current = d
    void reload()
  }
  function redo() {
    const next = redoStack.current.pop()
    if (!next) return
    undoStack.current.push(JSON.stringify(docRef.current))
    const d = JSON.parse(next) as CardTemplateDoc
    onChange(d)
    docRef.current = d
    void reload()
  }
  function updateSelected(patch: Record<string, unknown>, meta?: Partial<ElementMeta>) {
    const canvas = canvasRef.current
    const obj = canvas?.getActiveObject()
    if (!canvas || !obj) return
    obj.set(patch)
    if (meta) setMeta(obj, meta)
    if (obj instanceof Textbox && ('fontSize' in patch || 'fontFamily' in patch || 'text' in patch || 'width' in patch)) obj.initDimensions()
    obj.setCoords()
    canvas.requestRenderAll()
    bump()
    commit()
  }
  function moveSelectedTo(x: number | null, y: number | null) {
    const canvas = canvasRef.current
    const obj = canvas?.getActiveObject()
    if (!canvas || !obj) return
    const tl = obj.getPositionByOrigin('left', 'top')
    obj.setPositionByOrigin(new Point(x ?? tl.x, y ?? tl.y), 'left', 'top')
    obj.setCoords()
    canvas.requestRenderAll()
    bump()
    commit()
  }
  function toggleDoubleSided(on: boolean) {
    const d = docRef.current
    const next: CardTemplateDoc = on
      ? { ...d, doubleSided: true, back: d.back ?? { fabric: { version: '7', objects: [], background: '#ffffff' }, backgroundColor: '#ffffff' } }
      : { ...d, doubleSided: false }
    onChange(next)
    if (!on && side === 'back') setSide('front')
  }

  handlersRef.current = { undo, redo, removeSelected, duplicateSelected }

  const sel = selected
  const selMeta = sel ? metaOf(sel) : null
  const isText = sel instanceof Textbox || sel instanceof IText
  const objects = canvasRef.current?.getObjects() ?? []
  const safeMarginPx = mmToPx(2)

  const zoomOptions = useMemo(() => [0.3, 0.4, 0.5, 0.6, 0.75, 1, 1.5], [])

  return (
    <div className="editor">
      <div className="editor-toolbar">
        <fieldset className="btn-group toolbar-group" disabled={preview} title={preview ? 'Desative a pré-visualização para editar' : undefined}>
          <button className="btn small" onClick={() => addText('name')} title="Nome da pessoa">+ Nome</button>
          <FieldAdder onAdd={(f) => addText('field', f)} />
          <button className="btn small" onClick={() => addText('static')}>+ Texto</button>
          <button className="btn small" onClick={addPhotoSlot}>+ Foto 3x4</button>
          <button className="btn small" onClick={addLogoSlot}>+ Logo</button>
          <button className="btn small" onClick={addQr}>+ QR code</button>
          <button className="btn small" onClick={addRect}>+ Retângulo</button>
          <button className="btn small" onClick={addCircle}>+ Círculo</button>
          <button className="btn small" onClick={addLine}>+ Linha</button>
          <FilePicker accept="image/*" title="Inserir imagem (PNG, JPG, SVG)" onFile={(f) => void addImage(f)}>+ Imagem</FilePicker>
        </fieldset>
        <div className="btn-group">
          <button className="btn small" onClick={undo} title="Desfazer (Ctrl+Z)" aria-label="Desfazer" disabled={preview}>↶</button>
          <button className="btn small" onClick={redo} title="Refazer (Ctrl+Y)" aria-label="Refazer" disabled={preview}>↷</button>
          <select value={zoom} onChange={(e) => setZoom(Number(e.target.value))} title="Zoom" aria-label="Zoom" style={{ width: 90 }}>
            {zoomOptions.map((z) => (
              <option key={z} value={z}>{Math.round(z * 100)}%</option>
            ))}
          </select>
          <label className="inline small">
            <input type="checkbox" checked={preview} onChange={(e) => setPreview(e.target.checked)} /> Pré-visualizar com dados de exemplo
          </label>
        </div>
      </div>

      <div className="editor-body">
        <div className="editor-canvas-wrap">
          <div className="row between" style={{ marginBottom: 8 }}>
            <div className="btn-group">
              <button className={`btn small ${side === 'front' ? 'primary' : ''}`} onClick={() => setSide('front')}>Frente</button>
              <button className={`btn small ${side === 'back' ? 'primary' : ''}`} onClick={() => setSide('back')} disabled={!doc.doubleSided}>Verso</button>
              <label className="inline small">
                <input type="checkbox" checked={doc.doubleSided} onChange={(e) => toggleDoubleSided(e.target.checked)} /> Frente e verso
              </label>
            </div>
            <div className="small muted">
              CR80 {CR80.widthMm} × {CR80.heightMm} mm · {doc.width} × {doc.height} px a 300 dpi
            </div>
          </div>
          <div className="editor-stage">
            <div className="editor-card" style={{ width: doc.width * zoom, height: doc.height * zoom }}>
              <canvas ref={canvasElRef} />
              <div className="safe-area" style={{ inset: safeMarginPx * zoom }} title="Margem de segurança (2 mm)" />
            </div>
          </div>
          {preview && warnings.length > 0 && (
            <div className="alert warning small" style={{ marginTop: 8 }}>{warnings.join(' ')}</div>
          )}
          <div className="small muted" style={{ marginTop: 6 }}>
            Dica: clique duas vezes num texto para editar. Use <code>{'{{campo}}'}</code> para inserir dados da pessoa. Setas movem 1 px (Shift = 10 px); Delete remove; Ctrl+D duplica.
          </div>
        </div>

        <aside className="editor-panel">
          <h3>Fundo</h3>
          <div className="row" style={preview ? { opacity: 0.5, pointerEvents: 'none' } : undefined}>
            <label className="inline">
              Cor
              <input type="color" value={typeof canvasRef.current?.backgroundColor === 'string' ? canvasRef.current.backgroundColor : currentSide.backgroundColor} onChange={(e) => setBackgroundColor(e.target.value)} style={{ width: 48, padding: 2 }} />
            </label>
            <FilePicker accept="image/*" onFile={(f) => void setBackgroundImage(f)}>Imagem de fundo</FilePicker>
            <button className="btn small ghost" onClick={() => void setBackgroundImage(null)}>Remover imagem</button>
          </div>
          <hr />
          {preview ? (
            <div className="alert info small">Pré-visualização com dados de exemplo. Desative para editar os elementos.</div>
          ) : sel && selMeta ? (
            <div className="stack">
              <h3>Elemento selecionado</h3>
              <label>
                Papel
                <select value={selMeta.role ?? 'static'} onChange={(e) => {
                  const role = e.target.value as ElementRole
                  const patch: Partial<ElementMeta> = { role }
                  if (role === 'photo') patch.fit = 'cover'
                  if (role === 'logo') patch.fit = 'contain'
                  if (role === 'name') { patch.field = 'display_name'; patch.textTemplate = '{{display_name}}'; if (isText) updateSelected({ text: '{{display_name}}' }) }
                  if (role === 'field' && isText) patch.textTemplate = (sel as Textbox).text
                  if (role === 'qr' && !selMeta.field) patch.field = '{{registration}}'
                  updateSelected({}, patch)
                }}>
                  {(Object.keys(ROLE_LABELS) as ElementRole[]).filter((r) => r !== 'barcode').map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </label>
              {(selMeta.role === 'photo' || selMeta.role === 'logo') && (
                <label>
                  Encaixe da imagem
                  <select value={selMeta.fit ?? 'cover'} onChange={(e) => updateSelected({}, { fit: e.target.value as 'cover' | 'contain' })}>
                    <option value="cover">Preencher (recorta)</option>
                    <option value="contain">Ajustar (mostra tudo)</option>
                  </select>
                </label>
              )}
              {selMeta.role === 'photo' && (
                <button className="btn small" onClick={() => { const w = Math.round((sel.width || 1) * sel.scaleX); updateSelected({ scaleX: 1, scaleY: 1, width: w, height: Math.round((w * 4) / 3) }) }}>
                  Ajustar proporção 3:4
                </button>
              )}
              {selMeta.role === 'qr' && (
                <label>
                  Conteúdo do QR (use {'{{campo}}'})
                  <input value={selMeta.field ?? ''} onChange={(e) => updateSelected({}, { field: e.target.value })} />
                </label>
              )}
              {isText && (
                <>
                  <label>
                    Texto {selMeta.role === 'field' || selMeta.role === 'name' ? '(com {{campos}})' : ''}
                    <textarea value={(sel as Textbox).text} onChange={(e) => updateSelected({ text: e.target.value }, selMeta.role === 'field' || selMeta.role === 'name' ? { textTemplate: e.target.value } : undefined)} />
                  </label>
                  {(selMeta.role === 'field' || selMeta.role === 'name') && (
                    <label>
                      Inserir campo
                      <select value="" onChange={(e) => { if (!e.target.value) return; const t = `${(sel as Textbox).text}{{${e.target.value}}}`; updateSelected({ text: t }, { textTemplate: t, field: e.target.value }) }}>
                        <option value="">— escolher —</option>
                        {DYNAMIC_FIELDS.map((f) => <option key={f} value={f}>{FIELD_LABELS[f]}</option>)}
                      </select>
                    </label>
                  )}
                  <div className="grid cols-2">
                    <label>
                      Fonte
                      <select value={String((sel as Textbox).fontFamily)} onChange={(e) => updateSelected({ fontFamily: e.target.value })}>
                        {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </label>
                    <label>
                      Tamanho (px)
                      <input type="number" min={6} max={400} value={Math.round((sel as Textbox).fontSize)} onChange={(e) => updateSelected({ fontSize: Number(e.target.value) || 12 })} />
                    </label>
                  </div>
                  <div className="row">
                    <button className={`btn small ${String((sel as Textbox).fontWeight) === 'bold' ? 'primary' : ''}`} onClick={() => updateSelected({ fontWeight: String((sel as Textbox).fontWeight) === 'bold' ? 'normal' : 'bold' })} aria-label="Negrito" title="Negrito"><b>N</b></button>
                    <button className={`btn small ${(sel as Textbox).fontStyle === 'italic' ? 'primary' : ''}`} onClick={() => updateSelected({ fontStyle: (sel as Textbox).fontStyle === 'italic' ? 'normal' : 'italic' })} aria-label="Itálico" title="Itálico"><i>I</i></button>
                    <button className={`btn small ${(sel as Textbox).underline ? 'primary' : ''}`} onClick={() => updateSelected({ underline: !(sel as Textbox).underline })} aria-label="Sublinhado" title="Sublinhado"><u>S</u></button>
                    <select value={(sel as Textbox).textAlign} onChange={(e) => updateSelected({ textAlign: e.target.value })} style={{ width: 120 }}>
                      <option value="left">Esquerda</option>
                      <option value="center">Centro</option>
                      <option value="right">Direita</option>
                    </select>
                  </div>
                </>
              )}
              <div className="grid cols-2">
                <label>
                  Cor {isText ? 'do texto' : 'de preenchimento'}
                  <input type="color" value={colorHex(sel.fill)} onChange={(e) => updateSelected({ fill: e.target.value })} />
                </label>
                <label>
                  Borda
                  <input type="color" value={colorHex(sel.stroke)} onChange={(e) => updateSelected({ stroke: e.target.value })} />
                </label>
                <label>
                  Espessura da borda
                  <input type="number" min={0} max={60} value={sel.strokeWidth ?? 0} onChange={(e) => updateSelected({ strokeWidth: Number(e.target.value) || 0 })} />
                </label>
                <label>
                  Opacidade
                  <input type="range" min={0} max={1} step={0.05} value={sel.opacity ?? 1} onChange={(e) => updateSelected({ opacity: Number(e.target.value) })} />
                </label>
                {sel instanceof Rect && (
                  <label>
                    Cantos arredondados
                    <input type="number" min={0} max={300} value={Math.round(sel.rx ?? 0)} onChange={(e) => updateSelected({ rx: Number(e.target.value) || 0, ry: Number(e.target.value) || 0 })} />
                  </label>
                )}
                <label>
                  Rotação (°)
                  <input type="number" min={-180} max={360} value={Math.round(sel.angle ?? 0)} onChange={(e) => updateSelected({ angle: Number(e.target.value) || 0 })} />
                </label>
              </div>
              <div className="grid cols-2">
                <label>
                  X (mm)
                  <input type="number" step={0.5} value={round1(pxToMm(sel.getPositionByOrigin('left', 'top').x))} onChange={(e) => moveSelectedTo(mmToPx(Number(e.target.value) || 0), null)} />
                </label>
                <label>
                  Y (mm)
                  <input type="number" step={0.5} value={round1(pxToMm(sel.getPositionByOrigin('left', 'top').y))} onChange={(e) => moveSelectedTo(null, mmToPx(Number(e.target.value) || 0))} />
                </label>
                <label>
                  Largura (mm)
                  <input type="number" step={0.5} value={round1(pxToMm((sel.width || 0) * sel.scaleX))} onChange={(e) => { const px = mmToPx(Number(e.target.value) || 1); updateSelected(isText ? { width: px } : { scaleX: px / (sel.width || 1) }) }} />
                </label>
                <label>
                  Altura (mm)
                  <input type="number" step={0.5} value={round1(pxToMm((sel.height || 0) * sel.scaleY))} onChange={(e) => { const px = mmToPx(Number(e.target.value) || 1); if (!isText) updateSelected({ scaleY: px / (sel.height || 1) }) }} disabled={isText} />
                </label>
              </div>
              <div className="row">
                <span className="small muted">Alinhar:</span>
                <button className="btn small" onClick={() => align('left')} aria-label="Alinhar à esquerda" title="Alinhar à esquerda">⇤</button>
                <button className="btn small" onClick={() => align('hcenter')} aria-label="Centralizar horizontalmente" title="Centralizar horizontalmente">↔</button>
                <button className="btn small" onClick={() => align('right')} aria-label="Alinhar à direita" title="Alinhar à direita">⇥</button>
                <button className="btn small" onClick={() => align('top')} aria-label="Alinhar ao topo" title="Alinhar ao topo">⤒</button>
                <button className="btn small" onClick={() => align('vcenter')} aria-label="Centralizar verticalmente" title="Centralizar verticalmente">↕</button>
                <button className="btn small" onClick={() => align('bottom')} aria-label="Alinhar à base" title="Alinhar à base">⤓</button>
              </div>
              <div className="row">
                <span className="small muted">Camada:</span>
                <button className="btn small" onClick={() => layer('front')}>Para frente</button>
                <button className="btn small" onClick={() => layer('forward')}>Avançar</button>
                <button className="btn small" onClick={() => layer('backward')}>Recuar</button>
                <button className="btn small" onClick={() => layer('back')}>Para trás</button>
              </div>
              <div className="row">
                <button className="btn small" onClick={() => void duplicateSelected()}>Duplicar</button>
                <button className="btn small danger" onClick={removeSelected}>Remover</button>
              </div>
            </div>
          ) : (
            <div className="muted small">Selecione um elemento no cartão para editar suas propriedades, ou adicione um novo pela barra acima.</div>
          )}
          <hr />
          <h3>Camadas ({objects.length})</h3>
          <div className="layers">
            {[...objects].reverse().map((o, i) => {
              const m = metaOf(o)
              const label = m.label || (o instanceof Textbox || o instanceof IText ? (o as Textbox).text.slice(0, 24) : o.type)
              return (
                <button key={m.elementId ?? i} className={`layer ${o === sel ? 'active' : ''}`} disabled={preview} onClick={() => { const c = canvasRef.current; if (!c) return; c.setActiveObject(o); c.requestRenderAll(); setSelected(o) }}>
                  <span className="badge">{ROLE_LABELS[m.role ?? 'static']}</span> {label}
                </button>
              )
            })}
            {objects.length === 0 && <div className="muted small">Nenhum elemento ainda.</div>}
          </div>
        </aside>
      </div>
    </div>
  )
}

function FieldAdder({ onAdd }: { onAdd: (field: string) => void }) {
  return (
    <select value="" onChange={(e) => { if (e.target.value) onAdd(e.target.value); e.target.value = '' }} title="Adicionar campo dinâmico" style={{ width: 170 }}>
      <option value="">+ Campo dinâmico…</option>
      {DYNAMIC_FIELDS.map((f) => (
        <option key={f} value={f}>{FIELD_LABELS[f]}</option>
      ))}
    </select>
  )
}

/** Marca os espaços (foto/logo/qr) para só escalar pelos cantos, mantendo proporção. */
function decorate(obj: FabricObject, preview: boolean): void {
  const m = metaOf(obj)
  if (m.role === 'photo' || m.role === 'qr') {
    obj.setControlsVisibility({ ml: false, mr: false, mt: false, mb: false })
  }
  if (preview) {
    obj.selectable = false
    obj.evented = false
  }
}

function colorHex(v: unknown): string {
  if (typeof v !== 'string') return '#000000'
  if (/^#[0-9a-f]{6}$/i.test(v)) return v
  if (/^#[0-9a-f]{3}$/i.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(v)
  if (m) return `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`
  return '#000000'
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
