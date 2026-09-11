/**
 * Núcleo de renderização do cartão (usado pelo editor, pela pré-visualização e
 * pela impressão). Carrega o JSON do Fabric.js de um lado do modelo em um
 * StaticCanvas do tamanho real (px a 300 dpi), substitui os placeholders pelos
 * dados da pessoa/empresa e exporta um PNG exato de 1013 × 638 (ou 638 × 1013).
 */
import { StaticCanvas, FabricImage, FabricObject, Rect, Textbox, IText, util, type TOptions, type ImageProps } from 'fabric'
import QRCode from 'qrcode'
import { EXTRA_PROPS, resolveText, type CardData, type CardSideDesign, type CardTemplateDoc, type ElementMeta } from '@shared/template'

export type MetaObject = FabricObject & ElementMeta

export function metaOf(obj: FabricObject): ElementMeta {
  const o = obj as MetaObject
  return { role: o.role, field: o.field, fit: o.fit, label: o.label, elementId: o.elementId, textTemplate: o.textTemplate }
}

export function setMeta(obj: FabricObject, meta: Partial<ElementMeta>): void {
  const o = obj as MetaObject
  for (const k of EXTRA_PROPS) {
    if (meta[k] !== undefined) (o as unknown as Record<string, unknown>)[k] = meta[k]
  }
}

/** Faz o Fabric serializar as propriedades extras. */
export function serializeCanvas(canvas: StaticCanvas): Record<string, unknown> {
  return canvas.toObject(EXTRA_PROPS as string[]) as Record<string, unknown>
}

export interface RenderOptions {
  /** Dados da pessoa; ausente = mostra placeholders como no editor. */
  data?: CardData | null
  /** Mostra as bordas tracejadas dos espaços vazios (foto/logo) quando não há dado. */
  showPlaceholders?: boolean
}

async function loadImage(url: string): Promise<FabricImage> {
  return FabricImage.fromURL(url, { crossOrigin: 'anonymous' })
}

/** Ajusta uma imagem dentro de um retângulo (cover recorta, contain mantém tudo visível). */
function fitImageToRect(img: FabricImage, rect: { left: number; top: number; width: number; height: number; angle: number; rx?: number; ry?: number }, fit: 'cover' | 'contain'): void {
  const iw = img.width || 1
  const ih = img.height || 1
  const scaleCover = Math.max(rect.width / iw, rect.height / ih)
  const scaleContain = Math.min(rect.width / iw, rect.height / ih)
  const scale = fit === 'cover' ? scaleCover : scaleContain
  img.set({
    originX: 'center',
    originY: 'center',
    scaleX: scale,
    scaleY: scale,
    angle: rect.angle,
    selectable: false,
    evented: false,
  })
  // Centro do retângulo (considerando rotação em torno do canto superior esquerdo)
  const rad = (rect.angle * Math.PI) / 180
  const cx = rect.left + (rect.width / 2) * Math.cos(rad) - (rect.height / 2) * Math.sin(rad)
  const cy = rect.top + (rect.width / 2) * Math.sin(rad) + (rect.height / 2) * Math.cos(rad)
  img.set({ left: cx, top: cy })
  if (fit === 'cover') {
    // Recorta pela área do retângulo (coordenadas relativas ao centro da imagem)
    const clip = new Rect({
      originX: 'center',
      originY: 'center',
      left: 0,
      top: 0,
      width: rect.width / scale,
      height: rect.height / scale,
      rx: (rect.rx ?? 0) / scale,
      ry: (rect.ry ?? 0) / scale,
    })
    img.clipPath = clip
  }
}

/**
 * Carrega um lado do modelo em um StaticCanvas já existente (limpa o conteúdo
 * anterior) e aplica os dados. Retorna a lista de avisos (imagens ausentes etc.).
 */
export async function loadSideIntoCanvas(canvas: StaticCanvas, side: CardSideDesign, doc: Pick<CardTemplateDoc, 'width' | 'height'>, opts: RenderOptions = {}): Promise<string[]> {
  const warnings: string[] = []
  canvas.setDimensions({ width: doc.width, height: doc.height })
  await canvas.loadFromJSON(side.fabric as object)
  if (!canvas.backgroundColor) canvas.backgroundColor = side.backgroundColor || '#ffffff'
  const data = opts.data ?? null
  if (!data) {
    canvas.requestRenderAll()
    return warnings
  }

  const objects = [...canvas.getObjects()]
  for (const obj of objects) {
    const meta = metaOf(obj)
    const role = meta.role ?? 'static'
    if (role === 'static') continue

    if (role === 'name' || role === 'field') {
      if (obj instanceof Textbox || obj instanceof IText) {
        const template = meta.textTemplate ?? (meta.field ? `{{${meta.field}}}` : obj.text ?? '')
        obj.set('text', resolveText(template, data))
        if (obj instanceof Textbox) obj.initDimensions()
      }
      continue
    }

    if (role === 'photo' || role === 'logo') {
      const url = role === 'photo' ? data.photoUrl : data.logoUrl
      const tl = obj.getPositionByOrigin('left', 'top')
      const bounds = { left: tl.x, top: tl.y, width: obj.getScaledWidth(), height: obj.getScaledHeight(), angle: obj.angle, rx: ((obj as Rect).rx ?? 0) * obj.scaleX, ry: ((obj as Rect).ry ?? 0) * obj.scaleY }
      if (!url) {
        if (!opts.showPlaceholders) {
          canvas.remove(obj)
        }
        warnings.push(role === 'photo' ? 'A pessoa não possui foto 3x4 cadastrada.' : 'A empresa não possui logo cadastrado.')
        continue
      }
      try {
        const img = await loadImage(url)
        fitImageToRect(img, bounds, meta.fit ?? (role === 'photo' ? 'cover' : 'contain'))
        const index = canvas.getObjects().indexOf(obj)
        canvas.remove(obj)
        canvas.insertAt(index, img)
      } catch {
        warnings.push(role === 'photo' ? 'Não foi possível carregar a foto.' : 'Não foi possível carregar o logo.')
      }
      continue
    }

    if (role === 'qr') {
      const text = resolveText(meta.field ?? '{{registration}}', data).trim()
      const tl = obj.getPositionByOrigin('left', 'top')
      const bounds = { left: tl.x, top: tl.y, width: obj.getScaledWidth(), height: obj.getScaledHeight(), angle: obj.angle }
      if (!text) {
        if (!opts.showPlaceholders) canvas.remove(obj)
        warnings.push('QR code sem conteúdo (campo vazio).')
        continue
      }
      try {
        const dataUrl = await QRCode.toDataURL(text, { errorCorrectionLevel: 'M', margin: 1, width: Math.round(Math.max(bounds.width, bounds.height)) })
        const img = await loadImage(dataUrl)
        fitImageToRect(img, { ...bounds, rx: 0, ry: 0 }, 'contain')
        const index = canvas.getObjects().indexOf(obj)
        canvas.remove(obj)
        canvas.insertAt(index, img)
      } catch {
        warnings.push('Não foi possível gerar o QR code.')
      }
    }
  }
  canvas.requestRenderAll()
  return warnings
}

/** Renderiza um lado do modelo e devolve o PNG (data URL) no tamanho exato de impressão. */
export async function renderSideToPng(side: CardSideDesign, doc: Pick<CardTemplateDoc, 'width' | 'height'>, opts: RenderOptions = {}): Promise<{ dataUrl: string; warnings: string[] }> {
  const el = document.createElement('canvas')
  const canvas = new StaticCanvas(el, { width: doc.width, height: doc.height, enableRetinaScaling: false })
  try {
    const warnings = await loadSideIntoCanvas(canvas, side, doc, opts)
    canvas.renderAll()
    const dataUrl = canvas.toDataURL({ format: 'png', multiplier: 1, enableRetinaScaling: false })
    return { dataUrl, warnings }
  } finally {
    canvas.dispose()
  }
}

/** Miniatura (JPEG pequena) para listagens. */
export async function renderThumbnail(doc: CardTemplateDoc, maxWidth = 400): Promise<string> {
  const el = document.createElement('canvas')
  const canvas = new StaticCanvas(el, { width: doc.width, height: doc.height, enableRetinaScaling: false })
  try {
    await loadSideIntoCanvas(canvas, doc.front, doc, { showPlaceholders: true })
    canvas.renderAll()
    return canvas.toDataURL({ format: 'jpeg', quality: 0.8, multiplier: maxWidth / doc.width, enableRetinaScaling: false })
  } finally {
    canvas.dispose()
  }
}

/** Renderiza frente (e verso) prontos para impressão. */
export async function renderCardForPrint(doc: CardTemplateDoc, data: CardData): Promise<{ front: string; back: string | null; warnings: string[] }> {
  const front = await renderSideToPng(doc.front, doc, { data })
  const back = doc.doubleSided && doc.back ? await renderSideToPng(doc.back, doc, { data }) : null
  return { front: front.dataUrl, back: back?.dataUrl ?? null, warnings: [...front.warnings, ...(back?.warnings ?? [])] }
}

export type { TOptions, ImageProps }
export { util }
