import { Router } from 'express'
import { z } from 'zod'
import { deleteAsset, getAssetData, saveAsset } from '../lib/assets.js'
import { HttpError, parseId, validate } from '../lib/http.js'

export const assetsRouter = Router()

const uploadSchema = z.object({
  kind: z.enum(['photo', 'logo', 'background', 'other']).default('other'),
  dataUrl: z.string().min(16),
})

assetsRouter.post('/', async (req, res) => {
  const body = validate(uploadSchema, req.body)
  const asset = await saveAsset(body.kind, body.dataUrl)
  res.status(201).json({ id: asset.id, kind: asset.kind, mime: asset.mime, width: asset.width, height: asset.height, sizeBytes: asset.size_bytes, url: `/api/assets/${asset.id}` })
})

assetsRouter.get('/:id', async (req, res) => {
  const found = await getAssetData(parseId(req.params.id))
  if (!found) throw new HttpError(404, 'Arquivo não encontrado.')
  res.setHeader('Content-Type', found.asset.mime)
  res.setHeader('Content-Length', String(found.data.length))
  res.setHeader('Cache-Control', 'private, max-age=86400')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  // Arquivos enviados pelo usuário (inclusive SVG) nunca executam script no contexto da aplicação
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox")
  res.end(found.data)
})

assetsRouter.delete('/:id', async (req, res) => {
  await deleteAsset(parseId(req.params.id))
  res.json({ ok: true })
})
