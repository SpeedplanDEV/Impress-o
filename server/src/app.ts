import express, { type Request, type Response, type NextFunction } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { config, lanAddresses } from './lib/config.js'
import os from 'node:os'
import { requireAuth } from './lib/auth.js'
import { authRouter } from './routes/auth.js'
import { apiRouter } from './routes/index.js'

/** Hosts aceitos (proteção contra DNS rebinding e requisições de outros sites). */
function allowedHostnames(): Set<string> {
  const set = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])
  if (config.host && config.host !== '0.0.0.0' && config.host !== '::') set.add(config.host)
  if (config.lanEnabled) {
    // Acesso pelo celular na rede local: aceita os IPs desta máquina e o nome dela
    for (const ip of lanAddresses()) set.add(ip)
    set.add(os.hostname().toLowerCase())
    set.add(`${os.hostname().toLowerCase()}.local`)
  }
  for (const h of (process.env.IMPRESSO_ALLOWED_HOSTS ?? '').split(',').map((x) => x.trim()).filter(Boolean)) set.add(h.toLowerCase())
  // Hospedagem: o domínio público informado pelo provedor (Render) ou pela URL configurada
  if (process.env.RENDER_EXTERNAL_HOSTNAME) set.add(process.env.RENDER_EXTERNAL_HOSTNAME.toLowerCase())
  const publicUrl = process.env.IMPRESSO_PUBLIC_URL?.trim()
  if (publicUrl) {
    const h = hostnameOf(publicUrl)
    if (h) set.add(h)
  }
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

/** Página mostrada quando o servidor sobe sem a interface compilada (dist/client). */
function paginaNaoCompilada(): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Impress-o</title>
<style>body{font-family:system-ui,sans-serif;max-width:640px;margin:48px auto;padding:0 16px;color:#1f2933;line-height:1.5}code{background:#eef2f7;padding:2px 6px;border-radius:4px}</style></head>
<body><h1>Impress-o: API ativa, interface ainda não compilada</h1>
<p>O servidor está no ar, mas a pasta <code>dist/client</code> não foi gerada ou ficou incompleta.</p>
<ol><li>Feche a janela do servidor.</li><li>Execute <code>iniciar.bat</code> (Windows) ou <code>./iniciar.sh</code>: ele compila e inicia de novo. Ou rode <code>npm run build</code> e depois <code>npm start</code>.</li></ol>
<p>Em desenvolvimento (<code>npm run dev</code>), a interface fica em <a href="http://localhost:5173">http://localhost:5173</a>.</p></body></html>`
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
  // Rotas públicas (status, setup, login) aceitam apenas corpos pequenos
  app.use('/api/auth', express.json({ limit: '16kb' }), authRouter)
  // Demais rotas recebem imagens em base64 (fotos, logos, PNG do cartão)
  app.use(express.json({ limit: '40mb' }))
  // Todas as demais rotas exigem sessão
  app.use('/api', requireAuth, apiRouter)

  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'Rota não encontrada.' })
  })

  // Cliente compilado (produção): exige o index.html, não só a pasta (um build interrompido deixa a pasta vazia)
  const indexHtml = path.join(config.clientDist, 'index.html')
  if (fs.existsSync(indexHtml)) {
    app.use(express.static(config.clientDist, { index: false, maxAge: '1h' }))
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(indexHtml)
    })
  } else {
    app.get('/{*splat}', (_req, res) => {
      res.status(503).type('html').send(paginaNaoCompilada())
    })
  }

  // Tratamento de erros: nunca vaza stack nem caminhos do disco para o cliente
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const code = (err as { code?: string })?.code
    const status = (err as { status?: number })?.status ?? (err as { statusCode?: number })?.statusCode ?? 500
    if (status >= 500) console.error(err)
    const message = status >= 500 ? 'Erro interno do servidor.' : code === 'ENOENT' ? 'Arquivo não encontrado.' : err instanceof Error ? err.message : 'Erro.'
    res.status(status).json({ error: message })
  })

  return app
}
