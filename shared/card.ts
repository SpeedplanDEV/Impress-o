/**
 * Constantes físicas do cartão CR80 (ISO/IEC 7810 ID-1), o formato usado pelas
 * impressoras Entrust Sigma DS.
 *
 *  - 85,60 mm × 53,98 mm (3,375" × 2,125")
 *  - A 300 dpi (resolução nativa das Sigma DS) isso corresponde a 1013 × 638 px
 *    (3,375 × 300 = 1012,5 → 1013; 2,125 × 300 = 637,5 → 638), o tamanho que o
 *    driver Entrust espera para uma imagem de borda a borda.
 */
export const CR80 = {
  widthMm: 85.6,
  heightMm: 53.98,
  widthIn: 3.375,
  heightIn: 2.125,
  dpi: 300,
  /** Largura/altura em pixels a 300 dpi (orientação paisagem). */
  widthPx: 1013,
  heightPx: 638,
  /** Raio dos cantos (~3,18 mm) apenas para pré-visualização. */
  cornerRadiusMm: 3.18,
} as const

export type Orientation = 'landscape' | 'portrait'

export function cardPixelSize(orientation: Orientation, dpi: number = CR80.dpi): { width: number; height: number } {
  const w = Math.round(CR80.widthIn * dpi)
  const h = Math.round(CR80.heightIn * dpi)
  return orientation === 'landscape' ? { width: w, height: h } : { width: h, height: w }
}

export function mmToPx(mm: number, dpi: number = CR80.dpi): number {
  return (mm / 25.4) * dpi
}

export function pxToMm(px: number, dpi: number = CR80.dpi): number {
  return (px / dpi) * 25.4
}

/** Foto 3x4 brasileira: 30 mm × 40 mm → 354 × 472 px a 300 dpi. */
export const PHOTO_3X4 = {
  widthMm: 30,
  heightMm: 40,
  aspect: 3 / 4,
  widthPx: Math.round(mmToPx(30)),
  heightPx: Math.round(mmToPx(40)),
} as const
