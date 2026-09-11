import express, { type Request, type Response, type NextFunction } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { config } from './lib/config.js'
import { requireAuth } from './lib/auth.js'
import { authRouter } from './routes/auth.js'
import { apiRouter } from './routes/index.js'

export function createApp() {
  const app = express()
  app.disable('x-powered-by')
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
