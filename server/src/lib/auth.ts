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

const SCRYPT_N = 32768
const SCRYPT_KEYLEN = 64
/** Memória necessária: 128 * N * r (r = 8) com folga. */
const scryptOptions = (n: number) => ({ N: n, r: 8, p: 1, maxmem: 128 * n * 8 * 2 })

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16)
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, scryptOptions(SCRYPT_N))
  return `scrypt$${SCRYPT_N}$${salt.toString('base64')}$${derived.toString('base64')}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== 'scrypt') return false
  const n = Number(parts[1])
  if (!Number.isInteger(n) || n < 1024 || n > 1 << 20) return false
  const salt = Buffer.from(parts[2], 'base64')
  const expected = Buffer.from(parts[3], 'base64')
  const derived = crypto.scryptSync(password, salt, expected.length, scryptOptions(n))
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected)
}

export interface UserAccount {
  id: number
  name: string
  password_hash: string
}

export async function getUser(): Promise<UserAccount | null> {
  const db = await getDb()
  return (await db.get<UserAccount>('SELECT id, name, password_hash FROM user_account WHERE id = 1')) ?? null
}

export async function isSetupDone(): Promise<boolean> {
  return (await getUser()) !== null
}

export async function createUser(name: string, password: string): Promise<UserAccount> {
  const db = await getDb()
  if (await getUser()) throw new Error('O sistema já possui um usuário cadastrado.')
  await db.run('INSERT INTO user_account (id, name, password_hash) VALUES (1, ?, ?)', [name, hashPassword(password)])
  return (await getUser())!
}

export async function updateUser(opts: { name?: string; password?: string }): Promise<UserAccount> {
  const db = await getDb()
  const user = await getUser()
  if (!user) throw new Error('Usuário não configurado.')
  if (opts.name !== undefined) await db.run('UPDATE user_account SET name = ?, updated_at = ? WHERE id = 1', [opts.name, nowIso()])
  if (opts.password !== undefined) {
    await db.run('UPDATE user_account SET password_hash = ?, updated_at = ? WHERE id = 1', [hashPassword(opts.password), nowIso()])
    // Trocar a senha invalida as outras sessões
    await db.run('DELETE FROM sessions')
  }
  return (await getUser())!
}

/* -------------------------- Sessões ------------------------------- */

export async function createSession(): Promise<{ token: string; expiresAt: string }> {
  const db = await getDb()
  const token = crypto.randomBytes(32).toString('base64url')
  const expires = new Date(Date.now() + config.sessionTtlHours * 3600 * 1000)
  const expiresAt = expires.toISOString().replace('T', ' ').slice(0, 19)
  await db.run('INSERT INTO sessions (token, expires_at) VALUES (?, ?)', [token, expiresAt])
  // Limpeza oportunista de sessões expiradas
  await db.run('DELETE FROM sessions WHERE expires_at < ?', [nowIso()])
  return { token, expiresAt }
}

export async function isValidSession(token: string | undefined): Promise<boolean> {
  if (!token) return false
  const db = await getDb()
  const row = await db.get<{ expires_at: string }>('SELECT expires_at FROM sessions WHERE token = ?', [token])
  if (!row) return false
  return row.expires_at >= nowIso()
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return
  const db = await getDb()
  await db.run('DELETE FROM sessions WHERE token = ?', [token])
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
  const secure = config.secureCookies ? '; Secure' : ''
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax${secure}; Expires=${expires.toUTCString()}`,
  )
}

export function clearSessionCookie(res: Response): void {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)
}

/** Middleware: exige sessão válida para tudo em /api exceto as rotas públicas. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  isValidSession(sessionTokenFromRequest(req))
    .then((ok) => {
      if (ok) next()
      else res.status(401).json({ error: 'Não autenticado.' })
    })
    .catch(next)
}
