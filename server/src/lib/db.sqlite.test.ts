import { afterAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'impresso-db-'))
process.env.IMPRESSO_DATA_DIR = tmp
delete process.env.DATABASE_URL
const { getDb, closeDb } = await import('./db.js')

afterAll(async () => {
  await closeDb()
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('SqliteDb', () => {
  it('uma transação que falha não leva junto gravações concorrentes de outra requisição', async () => {
    const db = await getDb()
    await db.exec('CREATE TABLE IF NOT EXISTS t (id INTEGER PRIMARY KEY AUTOINCREMENT, v TEXT)')
    const falha = db
      .transaction(async (tx) => {
        await tx.run('INSERT INTO t (v) VALUES (?)', ['dentro'])
        await new Promise((r) => setTimeout(r, 30))
        throw new Error('desfaz')
      })
      .catch(() => 'rolled back')
    // Chega enquanto a transação acima está aberta: deve esperar e gravar fora dela
    const fora = db.run('INSERT INTO t (v) VALUES (?)', ['fora'])
    expect(await falha).toBe('rolled back')
    await fora
    const rows = await db.all<{ v: string }>('SELECT v FROM t ORDER BY id')
    expect(rows.map((r) => r.v)).toEqual(['fora'])
  })
  it('transação aninhada reutiliza a mesma transação', async () => {
    const db = await getDb()
    await db.transaction(async (tx) => {
      await tx.run('INSERT INTO t (v) VALUES (?)', ['a'])
      await tx.transaction(async (tx2) => {
        await tx2.run('INSERT INTO t (v) VALUES (?)', ['b'])
      })
    })
    const n = await db.get<{ c: number }>('SELECT COUNT(*) AS c FROM t')
    expect(Number(n?.c)).toBe(3)
  })
})
