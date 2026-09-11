/**
 * Arquivos binários (fotos 3x4, logos, fundos de modelo).
 *
 * O conteúdo fica NO BANCO (coluna BLOB/BYTEA), e não em disco: assim o mesmo
 * banco na nuvem (Supabase/Neon) serve várias máquinas e o backup é um só.
 * Arquivos gravados em data/uploads por versões anteriores são importados
 * para o banco na inicialização (ver importarUploadsAntigos).
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { getDb, type Db } from './db.js'
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

const ASSET_COLUMNS = 'id, kind, mime, file_name, width, height, size_bytes, sha256, created_at'

export async function saveAsset(kind: AssetKind, dataUrl: string): Promise<AssetRow> {
  const { mime, buffer } = parseDataUrl(dataUrl)
  return saveAssetBuffer(kind, mime, buffer)
}

export async function saveAssetBuffer(kind: AssetKind, mime: string, buffer: Buffer): Promise<AssetRow> {
  const db = await getDb()
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex')
  const existing = await db.get<AssetRow>(`SELECT ${ASSET_COLUMNS} FROM assets WHERE sha256 = ? AND kind = ? AND data IS NOT NULL`, [sha256, kind])
  if (existing) return existing
  const fileName = `${kind}-${sha256.slice(0, 16)}-${crypto.randomBytes(4).toString('hex')}.${MIME_EXT[mime] ?? 'bin'}`
  const size = imageSize(mime, buffer)
  const row = await db.get<{ id: number }>(
    'INSERT INTO assets (kind, mime, file_name, width, height, size_bytes, sha256, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
    [kind, mime, fileName, size?.width ?? null, size?.height ?? null, buffer.length, sha256, buffer],
  )
  return (await getAsset(row!.id))!
}

export async function getAsset(id: number): Promise<AssetRow | null> {
  const db = await getDb()
  return (await db.get<AssetRow>(`SELECT ${ASSET_COLUMNS} FROM assets WHERE id = ?`, [id])) ?? null
}

/** Conteúdo binário do arquivo (do banco; ou do disco, para registros antigos). */
export async function getAssetData(id: number): Promise<{ asset: AssetRow; data: Buffer } | null> {
  const db = await getDb()
  const row = await db.get<AssetRow & { data: Buffer | null }>(`SELECT ${ASSET_COLUMNS}, data FROM assets WHERE id = ?`, [id])
  if (!row) return null
  const { data, ...asset } = row
  if (data && data.length > 0) return { asset, data: Buffer.isBuffer(data) ? data : Buffer.from(data) }
  const legacy = path.join(config.uploadsDir, asset.file_name)
  if (fs.existsSync(legacy)) return { asset, data: fs.readFileSync(legacy) }
  return null
}

export async function deleteAsset(id: number): Promise<void> {
  const db = await getDb()
  const asset = await getAsset(id)
  if (!asset) return
  await db.run('UPDATE companies SET logo_asset_id = NULL WHERE logo_asset_id = ?', [id])
  await db.run('UPDATE persons SET photo_asset_id = NULL WHERE photo_asset_id = ?', [id])
  await db.run('DELETE FROM assets WHERE id = ?', [id])
  try {
    fs.unlinkSync(path.join(config.uploadsDir, asset.file_name))
  } catch {
    /* não existia em disco */
  }
}

/** Data URL do arquivo (usado pelo renderizador do cartão). */
export async function assetToDataUrl(id: number | null | undefined): Promise<string | null> {
  if (!id) return null
  const found = await getAssetData(id)
  if (!found) return null
  return `data:${found.asset.mime};base64,${found.data.toString('base64')}`
}

/** URL relativa servida pela API. */
export function assetUrl(id: number | null | undefined): string | null {
  return id ? `/api/assets/${id}` : null
}

/**
 * Importa para o banco os arquivos que versões anteriores gravaram em
 * data/uploads (registros sem `data`). Roda uma vez na inicialização.
 */
export async function importarUploadsAntigos(dbIn?: Db, uploadsDir: string = config.uploadsDir): Promise<number> {
  const db = dbIn ?? (await getDb())
  const pendentes = await db.all<{ id: number; file_name: string }>('SELECT id, file_name FROM assets WHERE data IS NULL')
  let importados = 0
  for (const a of pendentes) {
    const p = path.join(uploadsDir, a.file_name)
    if (!fs.existsSync(p)) continue
    await db.run('UPDATE assets SET data = ? WHERE id = ?', [fs.readFileSync(p), a.id])
    importados++
  }
  return importados
}
