import { describe, expect, it } from 'vitest'
import { buildCalibrationCard, RgbImage } from './png.js'
import { imageSize } from './assets.js'
import { buildCardPdf } from './pdf.js'
import { PDFDocument } from 'pdf-lib'

describe('png', () => {
  it('gera PNG válido com as dimensões corretas', () => {
    const png = new RgbImage(10, 5).toPng()
    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG')
    expect(imageSize('image/png', png)).toEqual({ width: 10, height: 5 })
  })
  it('cartão de calibração em 1013×638', () => {
    const png = buildCalibrationCard(1013, 638)
    expect(imageSize('image/png', png)).toEqual({ width: 1013, height: 638 })
  })
})

describe('pdf', () => {
  it('gera PDF com página do tamanho CR80 e duas páginas quando há verso', async () => {
    const png = buildCalibrationCard(1013, 638)
    const pdf = await buildCardPdf({ frontPng: png, backPng: png, orientation: 'landscape' })
    expect(pdf.subarray(0, 4).toString('latin1')).toBe('%PDF')
    const doc = await PDFDocument.load(pdf)
    expect(doc.getPageCount()).toBe(2)
    expect(doc.getPage(0).getSize()).toEqual({ width: 243, height: 153 })
    const portrait = await PDFDocument.load(await buildCardPdf({ frontPng: buildCalibrationCard(638, 1013), orientation: 'portrait' }))
    expect(portrait.getPageCount()).toBe(1)
    expect(portrait.getPage(0).getSize()).toEqual({ width: 153, height: 243 })
  })
})
