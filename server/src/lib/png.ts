/**
 * Codificador PNG mínimo (RGB 8 bits, sem dependências) para gerar imagens
 * utilitárias no servidor, como o cartão de teste de alinhamento.
 */
import zlib from 'node:zlib'

const CRC_TABLE: number[] = []
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  CRC_TABLE[n] = c >>> 0
}
function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

export class RgbImage {
  readonly width: number
  readonly height: number
  readonly data: Buffer

  constructor(width: number, height: number, fill: [number, number, number] = [255, 255, 255]) {
    this.width = width
    this.height = height
    this.data = Buffer.alloc(width * height * 3)
    for (let i = 0; i < width * height; i++) {
      this.data[i * 3] = fill[0]
      this.data[i * 3 + 1] = fill[1]
      this.data[i * 3 + 2] = fill[2]
    }
  }

  set(x: number, y: number, rgb: [number, number, number]): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return
    const i = (y * this.width + x) * 3
    this.data[i] = rgb[0]
    this.data[i + 1] = rgb[1]
    this.data[i + 2] = rgb[2]
  }

  rect(x: number, y: number, w: number, h: number, rgb: [number, number, number]): void {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, rgb)
  }

  toPng(): Buffer {
    const ihdr = Buffer.alloc(13)
    ihdr.writeUInt32BE(this.width, 0)
    ihdr.writeUInt32BE(this.height, 4)
    ihdr[8] = 8
    ihdr[9] = 2
    const stride = this.width * 3
    const raw = Buffer.alloc((stride + 1) * this.height)
    for (let y = 0; y < this.height; y++) {
      raw[y * (stride + 1)] = 0
      this.data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
    }
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ])
  }
}

/**
 * Cartão de teste de alinhamento: moldura na borda, marcas a cada 5 mm,
 * cruz central e blocos de cor (para conferir margens, escala e cores no driver).
 */
export function buildCalibrationCard(width: number, height: number, dpi = 300): Buffer {
  const img = new RgbImage(width, height)
  const mm = dpi / 25.4
  const black: [number, number, number] = [0, 0, 0]
  const gray: [number, number, number] = [150, 150, 150]
  // Moldura de 1 px na borda absoluta e outra a 1 mm
  img.rect(0, 0, width, 1, black)
  img.rect(0, height - 1, width, 1, black)
  img.rect(0, 0, 1, height, black)
  img.rect(width - 1, 0, 1, height, black)
  const m1 = Math.round(mm)
  img.rect(m1, m1, width - 2 * m1, 1, gray)
  img.rect(m1, height - m1 - 1, width - 2 * m1, 1, gray)
  img.rect(m1, m1, 1, height - 2 * m1, gray)
  img.rect(width - m1 - 1, m1, 1, height - 2 * m1, gray)
  // Marcas a cada 5 mm nas bordas
  for (let x = 0; x < width; x += 5 * mm) {
    const xi = Math.round(x)
    const len = Math.round(x % (10 * mm) < 1 ? 3 * mm : 1.5 * mm)
    img.rect(xi, 0, 1, len, black)
    img.rect(xi, height - len, 1, len, black)
  }
  for (let y = 0; y < height; y += 5 * mm) {
    const yi = Math.round(y)
    const len = Math.round(y % (10 * mm) < 1 ? 3 * mm : 1.5 * mm)
    img.rect(0, yi, len, 1, black)
    img.rect(width - len, yi, len, 1, black)
  }
  // Cruz central
  const cx = Math.round(width / 2)
  const cy = Math.round(height / 2)
  img.rect(cx - Math.round(5 * mm), cy, Math.round(10 * mm), 1, black)
  img.rect(cx, cy - Math.round(5 * mm), 1, Math.round(10 * mm), black)
  // Blocos de cor (C M Y K R G B) de 8 mm
  const colors: [number, number, number][] = [[0, 174, 239], [236, 0, 140], [255, 241, 0], [0, 0, 0], [255, 0, 0], [0, 160, 0], [0, 0, 255]]
  const size = Math.round(8 * mm)
  const startX = cx - Math.round((colors.length * (size + 4)) / 2)
  colors.forEach((c, i) => img.rect(startX + i * (size + 4), cy + Math.round(8 * mm), size, size, c))
  // Escala de cinza
  for (let i = 0; i < 10; i++) {
    const v = Math.round(255 - i * 25)
    img.rect(startX + i * Math.round(size * 0.7), cy - Math.round(16 * mm), Math.round(size * 0.7), Math.round(5 * mm), [v, v, v])
  }
  return img.toPng()
}
