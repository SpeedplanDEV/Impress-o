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

describe('migração de bancos SQLite antigos', () => {
  it('acrescenta as colunas novas a um banco criado pela versão 1 e importa os uploads antigos', async () => {
    const { DatabaseSync } = await import('node:sqlite')
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'impresso-legacy-'))
    const file = path.join(dir, 'legacy.sqlite')
    const legacy = new DatabaseSync(file)
    legacy.exec(`
      CREATE TABLE schema_version (version INTEGER PRIMARY KEY);
      INSERT INTO schema_version (version) VALUES (1);
      CREATE TABLE assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, mime TEXT NOT NULL, file_name TEXT NOT NULL,
        width INTEGER, height INTEGER, size_bytes INTEGER NOT NULL, sha256 TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE printers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, adapter TEXT NOT NULL, system_name TEXT, host TEXT,
        model TEXT NOT NULL DEFAULT 'x', dpi INTEGER NOT NULL DEFAULT 300, duplex INTEGER NOT NULL DEFAULT 0, is_default INTEGER NOT NULL DEFAULT 0,
        options_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE print_jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, status TEXT NOT NULL DEFAULT 'queued', copies INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')));
      INSERT INTO assets (kind, mime, file_name, size_bytes, sha256) VALUES ('photo', 'image/png', 'foto-antiga.png', 3, 'abc');
    `)
    legacy.close()
    fs.mkdirSync(path.join(dir, 'uploads'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'uploads', 'foto-antiga.png'), Buffer.from([1, 2, 3]))

    // Abre o banco antigo com a camada atual
    const { openSqliteFile } = await import('./db.js')
    const { importarUploadsAntigos } = await import('./assets.js')
    const db = await openSqliteFile(file)
    const cols = await db.all<{ name: string }>('PRAGMA table_info(assets)')
    expect(cols.map((c) => c.name)).toContain('data')
    const pcols = await db.all<{ name: string }>('PRAGMA table_info(printers)')
    expect(pcols.map((c) => c.name)).toContain('instance_id')
    const v = await db.get<{ v: number }>('SELECT MAX(version) AS v FROM schema_version')
    expect(Number(v?.v)).toBeGreaterThanOrEqual(2)
    expect(await importarUploadsAntigos(db, path.join(dir, 'uploads'))).toBe(1)
    const row = await db.get<{ data: Buffer }>('SELECT data FROM assets WHERE id = 1')
    expect(Buffer.from(row!.data)).toEqual(Buffer.from([1, 2, 3]))
    await db.close()
    // Reabrir não repete a migração
    const db2 = await openSqliteFile(file)
    expect((await db2.all<{ name: string }>('PRAGMA table_info(assets)')).filter((c) => c.name === 'data')).toHaveLength(1)
    await db2.close()
    fs.rmSync(dir, { recursive: true, force: true })
  })
})

describe('getDb() dentro de uma transação', () => {
  it('não trava: a chamada é roteada para a transação em andamento', async () => {
    const db = await getDb()
    await db.exec('CREATE TABLE IF NOT EXISTS t2 (id INTEGER PRIMARY KEY AUTOINCREMENT, v TEXT)')
    await db.transaction(async (tx) => {
      await tx.run('INSERT INTO t2 (v) VALUES (?)', ['a'])
      const outer = await getDb() // helper que ignora o tx
      await outer.run('INSERT INTO t2 (v) VALUES (?)', ['b'])
    })
    const n = await db.get<{ c: number }>('SELECT COUNT(*) AS c FROM t2')
    expect(Number(n?.c)).toBe(2)
  })
})
