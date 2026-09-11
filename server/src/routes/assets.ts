import { Router } from 'express'
import fs from 'node:fs'
import { z } from 'zod'
import { assetPath, deleteAsset, getAsset, saveAsset } from '../lib/assets.js'
import { HttpError, parseId, validate } from '../lib/http.js'

export const assetsRouter = Router()

const uploadSchema = z.object({
  kind: z.enum(['photo', 'logo', 'background', 'other']).default('other'),
  dataUrl: z.string().min(16),
})

assetsRouter.post('/', (req, res) => {
  const body = validate(uploadSchema, req.body)
  const asset = saveAsset(body.kind, body.dataUrl)
  res.status(201).json({ id: asset.id, kind: asset.kind, mime: asset.mime, width: asset.width, height: asset.height, sizeBytes: asset.size_bytes, url: `/api/assets/${asset.id}` })
})

assetsRouter.get('/:id', (req, res) => {
  const asset = getAsset(parseId(req.params.id))
  if (!asset) throw new HttpError(404, 'Arquivo não encontrado.')
  const p = assetPath(asset)
  if (!fs.existsSync(p)) throw new HttpError(404, 'Arquivo não encontrado no disco.')
  res.setHeader('Content-Type', asset.mime)
  res.setHeader('Cache-Control', 'private, max-age=86400')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  // Arquivos enviados pelo usuário (inclusive SVG) nunca executam script no contexto da aplicação
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox")
  res.sendFile(p)
})

assetsRouter.delete('/:id', (req, res) => {
  deleteAsset(parseId(req.params.id))
  res.json({ ok: true })
})
