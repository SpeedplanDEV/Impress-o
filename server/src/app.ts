import express, { type Request, type Response, type NextFunction } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { config } from './lib/config.js'
import { requireAuth } from './lib/auth.js'
import { authRouter } from './routes/auth.js'
import { apiRouter } from './routes/index.js'

/** Hosts aceitos (proteção contra DNS rebinding e requisições de outros sites). */
function allowedHostnames(): Set<string> {
  const set = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])
  if (config.host && config.host !== '0.0.0.0' && config.host !== '::') set.add(config.host)
  for (const h of (process.env.IMPRESSO_ALLOWED_HOSTS ?? '').split(',').map((x) => x.trim()).filter(Boolean)) set.add(h.toLowerCase())
  return set
}

function hostnameOf(value: string | undefined): string | null {
  if (!value) return null
  try {
    return new URL(/^[a-z]+:\/\//i.test(value) ? value : `http://${value}`).hostname.toLowerCase()
  } catch {
    return null
  }
}

export function createApp() {
  const app = express()
  app.disable('x-powered-by')

  const allowed = allowedHostnames()
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    const host = hostnameOf(req.headers.host)
    if (!host || !allowed.has(host)) {
      res.status(421).json({ error: 'Host não permitido. Acesse pelo endereço local (localhost) ou configure IMPRESSO_ALLOWED_HOSTS.' })
      return
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const origin = hostnameOf(req.headers.origin) ?? hostnameOf(req.headers.referer)
      const fetchSite = req.headers['sec-fetch-site']
      if ((origin && !allowed.has(origin)) || fetchSite === 'cross-site') {
        res.status(403).json({ error: 'Requisição de origem não permitida.' })
        return
      }
    }
    next()
  })
  app.use(express.json({ limit: '40mb' }))

  // Rotas públicas (status, setup, login)
  app.use('/api/auth', authRouter)
  // Todas as demais rotas exigem sessão
  app.use('/api', requireAuth, apiRouter)

  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'Rota não encontrada.' })
  })

  // Cliente compilado (produção)
  if (fs.existsSync(config.clientDist)) {
    app.use(express.static(config.clientDist, { index: false, maxAge: '1h' }))
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(config.clientDist, 'index.html'))
    })
  } else {
    app.get('/', (_req, res) => {
      res
        .type('text/plain')
        .send('Impress-o API ativa. Em desenvolvimento use "npm run dev" (Vite em http://localhost:5173). Em produção rode "npm run build" antes.')
    })
  }

  // Tratamento de erros: nunca vaza stack para o cliente
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : 'Erro interno.'
    const status = (err as { status?: number })?.status ?? (err as { statusCode?: number })?.statusCode ?? 500
    if (status >= 500) console.error(err)
    res.status(status).json({ error: status >= 500 ? 'Erro interno do servidor.' : message })
  })

  return app
}
