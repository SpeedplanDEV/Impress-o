import { PDFDocument, degrees } from 'pdf-lib'
import { CR80 } from '../../../shared/card.js'

const PT_PER_IN = 72

/**
 * Gera um PDF com uma página por face, exatamente do tamanho do cartão CR80
 * (243 × 153 pt em paisagem). Usado para o CUPS e para exportação/gráfica.
 */
export async function buildCardPdf(opts: {
  frontPng: Buffer
  backPng?: Buffer | null
  orientation: 'landscape' | 'portrait'
  rotate180?: boolean
  /** Força a página em paisagem (mídia do CUPS); desenhos em retrato são girados 90°. */
  mediaLandscape?: boolean
}): Promise<Buffer> {
  const doc = await PDFDocument.create()
  doc.setTitle('Cartão Impress-o')
  doc.setProducer('Impress-o')
  const wPt = CR80.widthIn * PT_PER_IN
  const hPt = CR80.heightIn * PT_PER_IN
  const landscape = opts.orientation === 'landscape'
  const rotate90 = !landscape && !!opts.mediaLandscape
  const pageW = landscape || rotate90 ? wPt : hPt
  const pageH = landscape || rotate90 ? hPt : wPt
  const sides = [opts.frontPng, ...(opts.backPng ? [opts.backPng] : [])]
  for (const png of sides) {
    const page = doc.addPage([pageW, pageH])
    const img = await doc.embedPng(png)
    if (rotate90) {
      // Imagem em retrato (hPt × wPt) girada 90° anti-horário para ocupar a página em paisagem
      const angle = opts.rotate180 ? 270 : 90
      if (angle === 90) page.drawImage(img, { x: pageW, y: 0, width: pageH, height: pageW, rotate: degrees(90) })
      else page.drawImage(img, { x: 0, y: pageH, width: pageH, height: pageW, rotate: degrees(270) })
    } else if (opts.rotate180) {
      page.drawImage(img, { x: pageW, y: pageH, width: pageW, height: pageH, rotate: degrees(180) })
    } else {
      page.drawImage(img, { x: 0, y: 0, width: pageW, height: pageH })
    }
  }
  return Buffer.from(await doc.save())
}
