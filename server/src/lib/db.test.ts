import { describe, expect, it } from 'vitest'
import { prepareDatabaseUrl, toPgPlaceholders } from './db.js'

describe('toPgPlaceholders', () => {
  it('numera os placeholders e ignora ? dentro de literais', () => {
    expect(toPgPlaceholders("SELECT * FROM t WHERE a = ? AND b = '?' AND c = ?")).toBe("SELECT * FROM t WHERE a = $1 AND b = '?' AND c = $2")
  })
})

describe('prepareDatabaseUrl', () => {
  it('liga SSL sem validar cadeia por padrão em hosts remotos e remove sslmode da URL', () => {
    const r = prepareDatabaseUrl('postgresql://u:p@ep-x.sa-east-1.aws.neon.tech/neondb?sslmode=require', {})
    expect(r.ssl).toEqual({ rejectUnauthorized: false })
    expect(r.connectionString).toBe('postgresql://u:p@ep-x.sa-east-1.aws.neon.tech/neondb')
  })
  it('valida a cadeia com IMPRESSO_DB_SSL=verify', () => {
    const r = prepareDatabaseUrl('postgresql://postgres.abc:senha@aws-0-sa-east-1.pooler.supabase.com:5432/postgres', { IMPRESSO_DB_SSL: 'verify' })
    expect(r.ssl).toEqual({ rejectUnauthorized: true })
  })
  it('desliga SSL em localhost e com sslmode=disable', () => {
    expect(prepareDatabaseUrl('postgres://u:p@localhost:5432/db', {}).ssl).toBe(false)
    expect(prepareDatabaseUrl('postgres://u:p@db.example.com/db?sslmode=disable', {}).ssl).toBe(false)
  })
})
