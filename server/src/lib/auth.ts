/**
 * Autenticação de usuário único.
 *  - A senha é definida na primeira execução (assistente de configuração).
 *  - Hash com scrypt (node:crypto), sem dependências externas.
 *  - Sessão por cookie HttpOnly com token aleatório guardado no banco.
 */
import crypto from 'node:crypto'
import type { Request, Response, NextFunction } from 'express'
import { getDb, nowIso } from './db.js'
import { config } from './config.js'

export const SESSION_COOKIE = 'impresso_session'

const SCRYPT_N = 16384
const SCRYPT_KEYLEN = 64

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16)
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_N })
  return `scrypt$${SCRYPT_N}$${salt.toString('base64')}$${derived.toString('base64')}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== 'scrypt') return false
  const n = Number(parts[1])
  const salt = Buffer.from(parts[2], 'base64')
  const expected = Buffer.from(parts[3], 'base64')
  const derived = crypto.scryptSync(password, salt, expected.length, { N: n })
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected)
}

export interface UserAccount {
  id: number
  name: string
  password_hash: string
}

export function getUser(): UserAccount | null {
  const row = getDb().prepare('SELECT id, name, password_hash FROM user_account WHERE id = 1').get() as unknown as UserAccount | undefined
  return row ?? null
}

export function isSetupDone(): boolean {
  return getUser() !== null
}

export function createUser(name: string, password: string): UserAccount {
  const db = getDb()
  if (getUser()) throw new Error('O sistema já possui um usuário cadastrado.')
  db.prepare('INSERT INTO user_account (id, name, password_hash) VALUES (1, ?, ?)').run(name, hashPassword(password))
  return getUser()!
}

export function updateUser(opts: { name?: string; password?: string }): UserAccount {
  const db = getDb()
  const user = getUser()
  if (!user) throw new Error('Usuário não configurado.')
  if (opts.name !== undefined) db.prepare("UPDATE user_account SET name = ?, updated_at = datetime('now') WHERE id = 1").run(opts.name)
  if (opts.password !== undefined) {
    db.prepare("UPDATE user_account SET password_hash = ?, updated_at = datetime('now') WHERE id = 1").run(hashPassword(opts.password))
    // Trocar a senha invalida as outras sessões
    db.prepare('DELETE FROM sessions').run()
  }
  return getUser()!
}

/* -------------------------- Sessões ------------------------------- */

export function createSession(): { token: string; expiresAt: string } {
  const token = crypto.randomBytes(32).toString('base64url')
  const expires = new Date(Date.now() + config.sessionTtlHours * 3600 * 1000)
  const expiresAt = expires.toISOString().replace('T', ' ').slice(0, 19)
  getDb().prepare('INSERT INTO sessions (token, expires_at) VALUES (?, ?)').run(token, expiresAt)
  // Limpeza oportunista de sessões expiradas
  getDb().prepare('DELETE FROM sessions WHERE expires_at < ?').run(nowIso())
  return { token, expiresAt }
}

export function isValidSession(token: string | undefined): boolean {
  if (!token) return false
  const row = getDb().prepare('SELECT expires_at FROM sessions WHERE token = ?').get(token) as unknown as { expires_at: string } | undefined
  if (!row) return false
  return row.expires_at >= nowIso()
}

export function destroySession(token: string | undefined): void {
  if (!token) return
  getDb().prepare('DELETE FROM sessions WHERE token = ?').run(token)
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx < 0) continue
    const k = part.slice(0, idx).trim()
    const v = part.slice(idx + 1).trim()
    if (!k) continue
    let value = v
    if (v.includes('%')) {
      try {
        value = decodeURIComponent(v)
      } catch {
        value = v
      }
    }
    out[k] = value
  }
  return out
}

export function sessionTokenFromRequest(req: Request): string | undefined {
  return parseCookies(req.headers.cookie)[SESSION_COOKIE]
}

export function setSessionCookie(res: Response, token: string, expiresAt: string): void {
  const expires = new Date(expiresAt.replace(' ', 'T') + 'Z')
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires.toUTCString()}`,
  )
}

export function clearSessionCookie(res: Response): void {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)
}

/** Middleware: exige sessão válida para tudo em /api exceto as rotas públicas. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (isValidSession(sessionTokenFromRequest(req))) {
    next()
    return
  }
  res.status(401).json({ error: 'Não autenticado.' })
}
