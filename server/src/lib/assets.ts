/**
 * Arquivos binários (fotos 3x4, logos, fundos de modelo).
 * Recebidos como data URL (base64) e gravados em data/uploads; metadados no SQLite.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { getDb } from './db.js'
import { config } from './config.js'
import { HttpError } from './http.js'

export type AssetKind = 'photo' | 'logo' | 'background' | 'other'

export interface AssetRow {
  id: number
  kind: AssetKind
  mime: string
  file_name: string
  width: number | null
  height: number | null
  size_bytes: number
  sha256: string
  created_at: string
}

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/gif': 'gif',
}

export const MAX_ASSET_BYTES = 15 * 1024 * 1024

export function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer } {
  const m = /^data:([\w/+.-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl)
  if (!m) throw new HttpError(400, 'Imagem inválida (esperado data URL base64).')
  const mime = m[1].toLowerCase()
  if (!Object.hasOwn(MIME_EXT, mime)) throw new HttpError(400, `Tipo de imagem não suportado: ${mime}. Use PNG, JPEG, WebP, GIF ou SVG.`)
  const buffer = Buffer.from(m[2].replace(/\s/g, ''), 'base64')
  if (buffer.length === 0) throw new HttpError(400, 'Imagem vazia.')
  if (buffer.length > MAX_ASSET_BYTES) throw new HttpError(413, 'Imagem muito grande (máximo 15 MB).')
  return { mime, buffer }
}

/** Lê largura/altura de PNG, JPEG, GIF e WebP sem dependências. */
export function imageSize(mime: string, buf: Buffer): { width: number; height: number } | null {
  try {
    if (mime === 'image/png' && buf.length >= 24 && buf.toString('ascii', 1, 4) === 'PNG') {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
    }
    if (mime === 'image/gif' && buf.length >= 10) {
      return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) }
    }
    if (mime === 'image/jpeg') {
      let i = 2
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xff) { i++; continue }
        const marker = buf[i + 1]
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue }
        const len = buf.readUInt16BE(i + 2)
        if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
          return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) }
        }
        i += 2 + len
      }
    }
    if (mime === 'image/webp' && buf.length >= 30 && buf.toString('ascii', 0, 4) === 'RIFF') {
      const chunk = buf.toString('ascii', 12, 16)
      if (chunk === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff }
      if (chunk === 'VP8L') {
        const b = buf.readUInt32LE(21)
        return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 }
      }
      if (chunk === 'VP8X') {
        return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) }
      }
    }
  } catch {
    /* ignora */
  }
  return null
}

export function assetPath(asset: Pick<AssetRow, 'file_name'>): string {
  return path.join(config.uploadsDir, asset.file_name)
}

export function saveAsset(kind: AssetKind, dataUrl: string): AssetRow {
  const { mime, buffer } = parseDataUrl(dataUrl)
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex')
  const db = getDb()
  const existing = db.prepare('SELECT * FROM assets WHERE sha256 = ? AND kind = ?').get(sha256, kind) as unknown as AssetRow | undefined
  if (existing && fs.existsSync(assetPath(existing))) return existing

  fs.mkdirSync(config.uploadsDir, { recursive: true })
  const fileName = `${kind}-${sha256.slice(0, 16)}-${crypto.randomBytes(4).toString('hex')}.${MIME_EXT[mime]}`
  fs.writeFileSync(path.join(config.uploadsDir, fileName), buffer)
  const size = imageSize(mime, buffer)
  const info = db
    .prepare('INSERT INTO assets (kind, mime, file_name, width, height, size_bytes, sha256) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(kind, mime, fileName, size?.width ?? null, size?.height ?? null, buffer.length, sha256)
  return getAsset(Number(info.lastInsertRowid))!
}

export function getAsset(id: number): AssetRow | null {
  const row = getDb().prepare('SELECT * FROM assets WHERE id = ?').get(id) as unknown as AssetRow | undefined
  return row ?? null
}

export function deleteAsset(id: number): void {
  const asset = getAsset(id)
  if (!asset) return
  getDb().prepare('DELETE FROM assets WHERE id = ?').run(id)
  try {
    fs.unlinkSync(assetPath(asset))
  } catch {
    /* já removido */
  }
}

/** Data URL do arquivo (usado pelo renderizador do cartão). */
export function assetToDataUrl(id: number | null | undefined): string | null {
  if (!id) return null
  const asset = getAsset(id)
  if (!asset) return null
  const p = assetPath(asset)
  if (!fs.existsSync(p)) return null
  return `data:${asset.mime};base64,${fs.readFileSync(p).toString('base64')}`
}

/** URL relativa servida pela API. */
export function assetUrl(id: number | null | undefined): string | null {
  return id ? `/api/assets/${id}` : null
}
