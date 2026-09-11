import { Router } from 'express'
import { z } from 'zod'
import {
  createSession, createUser, destroySession, getUser, isSetupDone, isValidSession,
  sessionTokenFromRequest, setSessionCookie, clearSessionCookie, updateUser, verifyPassword,
} from '../lib/auth.js'

export const authRouter = Router()

const setupSchema = z.object({
  name: z.string().trim().min(1, 'Informe um nome.').max(120),
  password: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres.').max(200),
})

/** Estado público: sistema configurado? sessão ativa? */
authRouter.get('/status', async (req, res) => {
  const user = await getUser()
  res.json({
    setupDone: user !== null,
    authenticated: await isValidSession(sessionTokenFromRequest(req)),
    userName: user?.name ?? null,
  })
})

/** Primeira execução: cria o único usuário e já inicia a sessão. */
authRouter.post('/setup', async (req, res) => {
  if (await isSetupDone()) {
    res.status(409).json({ error: 'O sistema já foi configurado. Faça login.' })
    return
  }
  const parsed = setupSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' })
    return
  }
  const user = await createUser(parsed.data.name, parsed.data.password)
  const s = await createSession()
  setSessionCookie(res, s.token, s.expiresAt)
  res.status(201).json({ ok: true, userName: user.name })
})

/** Proteção simples contra força bruta: atraso crescente após falhas consecutivas. */
let failedLogins = 0
let lockedUntil = 0

authRouter.post('/login', async (req, res) => {
  const user = await getUser()
  if (!user) {
    res.status(409).json({ error: 'O sistema ainda não foi configurado.' })
    return
  }
  if (Date.now() < lockedUntil) {
    const secs = Math.ceil((lockedUntil - Date.now()) / 1000)
    res.status(429).json({ error: `Muitas tentativas. Aguarde ${secs} segundo(s).` })
    return
  }
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  if (!verifyPassword(password, user.password_hash)) {
    failedLogins++
    if (failedLogins >= 5) lockedUntil = Date.now() + Math.min(60, 2 ** (failedLogins - 5)) * 5000
    await new Promise((r) => setTimeout(r, 400))
    res.status(401).json({ error: 'Senha incorreta.' })
    return
  }
  failedLogins = 0
  lockedUntil = 0
  const s = await createSession()
  setSessionCookie(res, s.token, s.expiresAt)
  res.json({ ok: true, userName: user.name })
})

authRouter.post('/logout', async (req, res) => {
  await destroySession(sessionTokenFromRequest(req))
  clearSessionCookie(res)
  res.json({ ok: true })
})

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(6, 'A nova senha deve ter pelo menos 6 caracteres.').max(200).optional(),
})

/** Atualiza nome e/ou senha do usuário (exige sessão). */
authRouter.put('/account', async (req, res) => {
  if (!(await isValidSession(sessionTokenFromRequest(req)))) {
    res.status(401).json({ error: 'Não autenticado.' })
    return
  }
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' })
    return
  }
  const user = (await getUser())!
  if (parsed.data.newPassword !== undefined) {
    if (!verifyPassword(parsed.data.currentPassword ?? '', user.password_hash)) {
      res.status(401).json({ error: 'Senha atual incorreta.' })
      return
    }
  }
  const updated = await updateUser({ name: parsed.data.name, password: parsed.data.newPassword })
  if (parsed.data.newPassword !== undefined) {
    const s = await createSession()
    setSessionCookie(res, s.token, s.expiresAt)
  }
  res.json({ ok: true, userName: updated.name })
})
