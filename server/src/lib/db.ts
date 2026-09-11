/**
 * Camada de acesso a dados com dois bancos suportados:
 *
 *  - SQLite local (padrão, sem configuração): módulo nativo `node:sqlite`.
 *  - Postgres (nuvem, gratuito no Supabase/Neon): driver `pg`, ativado quando
 *    a variável DATABASE_URL começa com postgres:// ou postgresql://.
 *
 * As consultas são escritas num SQL comum aos dois (placeholders `?`, ids com
 * `RETURNING id`, datas em texto 'YYYY-MM-DD HH:MM:SS' UTC). O adaptador
 * Postgres converte `?` em `$1..$n`. Diferenças de DDL ficam no esquema abaixo.
 */
import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'

export type Param = string | number | null | boolean | Buffer | Uint8Array
export type Row = Record<string, unknown>

export interface Db {
  readonly dialect: 'sqlite' | 'postgres'
  get<T = Row>(sql: string, params?: Param[]): Promise<T | undefined>
  all<T = Row>(sql: string, params?: Param[]): Promise<T[]>
  run(sql: string, params?: Param[]): Promise<{ changes: number }>
  exec(sql: string): Promise<void>
  /** Executa fn dentro de uma transação (BEGIN/COMMIT, ROLLBACK em erro). */
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>
  close(): Promise<void>
}

/** Data/hora atual em UTC no formato gravado no banco. */
export function nowIso(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19)
}

function normalizeParams(params: Param[] = []): (string | number | null | Buffer)[] {
  return params.map((p) => {
    if (p === undefined) return null
    if (typeof p === 'boolean') return p ? 1 : 0
    if (p instanceof Uint8Array && !Buffer.isBuffer(p)) return Buffer.from(p)
    return p as string | number | null | Buffer
  })
}

function normalizeRow<T>(row: Row | undefined): T | undefined {
  if (!row) return undefined
  for (const k of Object.keys(row)) {
    const v = row[k]
    if (v instanceof Uint8Array && !Buffer.isBuffer(v)) row[k] = Buffer.from(v)
    else if (typeof v === 'bigint') row[k] = Number(v)
  }
  return row as T
}

/* ------------------------------------------------------------------ */
/* Esquema                                                             */
/* ------------------------------------------------------------------ */

/**
 * DDL com marcadores de dialeto:
 *   {{ID}}   chave primária inteira autoincremento
 *   {{NOW}}  valor padrão "agora" em texto UTC
 *   {{BLOB}} coluna binária
 *   {{REAL}} ponto flutuante de dupla precisão
 */
const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS user_account (
        id            INTEGER PRIMARY KEY CHECK (id = 1),
        name          TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at    TEXT NOT NULL DEFAULT {{NOW}},
        updated_at    TEXT NOT NULL DEFAULT {{NOW}}
      );

      CREATE TABLE IF NOT EXISTS sessions (
        token      TEXT PRIMARY KEY,
        created_at TEXT NOT NULL DEFAULT {{NOW}},
        expires_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS companies (
        id         {{ID}},
        name       TEXT NOT NULL,
        cnpj       TEXT,
        logo_asset_id INTEGER,
        default_template_id INTEGER,
        notes      TEXT,
        created_at TEXT NOT NULL DEFAULT {{NOW}},
        updated_at TEXT NOT NULL DEFAULT {{NOW}}
      );

      CREATE TABLE IF NOT EXISTS departments (
        id         {{ID}},
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name       TEXT NOT NULL,
        color      TEXT,
        default_template_id INTEGER,
        created_at TEXT NOT NULL DEFAULT {{NOW}},
        updated_at TEXT NOT NULL DEFAULT {{NOW}},
        UNIQUE (company_id, name)
      );

      CREATE TABLE IF NOT EXISTS assets (
        id         {{ID}},
        kind       TEXT NOT NULL CHECK (kind IN ('photo','logo','background','other')),
        mime       TEXT NOT NULL,
        file_name  TEXT NOT NULL,
        width      INTEGER,
        height     INTEGER,
        size_bytes INTEGER NOT NULL,
        sha256     TEXT NOT NULL,
        data       {{BLOB}},
        created_at TEXT NOT NULL DEFAULT {{NOW}}
      );

      CREATE TABLE IF NOT EXISTS templates (
        id            {{ID}},
        name          TEXT NOT NULL,
        company_id    INTEGER REFERENCES companies(id) ON DELETE SET NULL,
        department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
        orientation   TEXT NOT NULL DEFAULT 'landscape' CHECK (orientation IN ('landscape','portrait')),
        double_sided  INTEGER NOT NULL DEFAULT 0,
        design_json   TEXT NOT NULL,
        thumbnail     TEXT,
        source        TEXT NOT NULL DEFAULT 'editor' CHECK (source IN ('editor','import','builtin')),
        created_at    TEXT NOT NULL DEFAULT {{NOW}},
        updated_at    TEXT NOT NULL DEFAULT {{NOW}}
      );

      CREATE TABLE IF NOT EXISTS persons (
        id            {{ID}},
        company_id    INTEGER REFERENCES companies(id) ON DELETE SET NULL,
        department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
        full_name     TEXT NOT NULL,
        display_name  TEXT,
        role_title    TEXT,
        registration  TEXT,
        document      TEXT,
        email         TEXT,
        phone         TEXT,
        valid_until   TEXT,
        photo_asset_id INTEGER REFERENCES assets(id) ON DELETE SET NULL,
        extra_json    TEXT NOT NULL DEFAULT '{}',
        template_id   INTEGER REFERENCES templates(id) ON DELETE SET NULL,
        active        INTEGER NOT NULL DEFAULT 1,
        created_at    TEXT NOT NULL DEFAULT {{NOW}},
        updated_at    TEXT NOT NULL DEFAULT {{NOW}}
      );
      CREATE INDEX IF NOT EXISTS idx_persons_company ON persons(company_id);
      CREATE INDEX IF NOT EXISTS idx_persons_department ON persons(department_id);

      CREATE TABLE IF NOT EXISTS printers (
        id           {{ID}},
        name         TEXT NOT NULL,
        adapter      TEXT NOT NULL CHECK (adapter IN ('system','mock')),
        system_name  TEXT,
        host         TEXT,
        model        TEXT NOT NULL DEFAULT 'Entrust Sigma DS',
        dpi          INTEGER NOT NULL DEFAULT 300,
        duplex       INTEGER NOT NULL DEFAULT 0,
        is_default   INTEGER NOT NULL DEFAULT 0,
        options_json TEXT NOT NULL DEFAULT '{}',
        created_at   TEXT NOT NULL DEFAULT {{NOW}},
        updated_at   TEXT NOT NULL DEFAULT {{NOW}}
      );

      CREATE TABLE IF NOT EXISTS print_jobs (
        id            {{ID}},
        printer_id    INTEGER REFERENCES printers(id) ON DELETE SET NULL,
        printer_name  TEXT,
        person_id     INTEGER REFERENCES persons(id) ON DELETE SET NULL,
        template_id   INTEGER REFERENCES templates(id) ON DELETE SET NULL,
        person_name   TEXT,
        template_name TEXT,
        copies        INTEGER NOT NULL DEFAULT 1,
        sides         INTEGER NOT NULL DEFAULT 1,
        status        TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','printing','done','error','cancelled')),
        error         TEXT,
        cost_json     TEXT,
        unit_cost     {{REAL}},
        total_cost    {{REAL}},
        output_path   TEXT,
        created_at    TEXT NOT NULL DEFAULT {{NOW}},
        finished_at   TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_print_jobs_created ON print_jobs(created_at);

      CREATE TABLE IF NOT EXISTS cost_profiles (
        id         {{ID}},
        name       TEXT NOT NULL,
        params_json TEXT NOT NULL,
        is_active  INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT {{NOW}},
        updated_at TEXT NOT NULL DEFAULT {{NOW}}
      );
    `,
  },
]

const DIALECT_TOKENS: Record<Db['dialect'], Record<string, string>> = {
  sqlite: {
    '{{ID}}': 'INTEGER PRIMARY KEY AUTOINCREMENT',
    '{{NOW}}': "(datetime('now'))",
    '{{BLOB}}': 'BLOB',
    '{{REAL}}': 'REAL',
  },
  postgres: {
    '{{ID}}': 'INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY',
    '{{NOW}}': "(to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS'))",
    '{{BLOB}}': 'BYTEA',
    '{{REAL}}': 'DOUBLE PRECISION',
  },
}

function renderDdl(sql: string, dialect: Db['dialect']): string {
  let out = sql
  for (const [token, value] of Object.entries(DIALECT_TOKENS[dialect])) out = out.split(token).join(value)
  return out
}

async function migrate(db: Db): Promise<void> {
  await db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)')
  const row = await db.get<{ v: number | null }>('SELECT MAX(version) AS v FROM schema_version')
  const current = Number(row?.v ?? 0)
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue
    await db.transaction(async (tx) => {
      await tx.exec(renderDdl(m.sql, db.dialect))
      await tx.run('INSERT INTO schema_version (version) VALUES (?)', [m.version])
    })
  }
}

/* ------------------------------------------------------------------ */
/* SQLite                                                              */
/* ------------------------------------------------------------------ */

/** Operações de uma transação SQLite já aberta (mesma conexão, sem novo BEGIN). */
class SqliteTxDb implements Db {
  readonly dialect = 'sqlite' as const
  private conn: import('node:sqlite').DatabaseSync

  constructor(conn: import('node:sqlite').DatabaseSync) {
    this.conn = conn
  }

  async get<T = Row>(sql: string, params: Param[] = []): Promise<T | undefined> {
    const row = this.conn.prepare(sql).get(...(normalizeParams(params) as never[])) as Row | undefined
    return normalizeRow<T>(row)
  }

  async all<T = Row>(sql: string, params: Param[] = []): Promise<T[]> {
    const rows = this.conn.prepare(sql).all(...(normalizeParams(params) as never[])) as Row[]
    return rows.map((r) => normalizeRow<T>(r) as T)
  }

  async run(sql: string, params: Param[] = []): Promise<{ changes: number }> {
    const info = this.conn.prepare(sql).run(...(normalizeParams(params) as never[]))
    return { changes: Number(info.changes) }
  }

  async exec(sql: string): Promise<void> {
    this.conn.exec(sql)
  }

  async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
    return fn(this)
  }

  async close(): Promise<void> {
    /* a conexão é da SqliteDb */
  }
}

/**
 * Conexão SQLite compartilhada.
 *
 * As chamadas são síncronas por baixo, mas o código que as usa é assíncrono:
 * entre um `await` e outro de uma transação, outra requisição poderia executar
 * na mesma conexão e ficar "dentro" daquela transação. Por isso a transação
 * segura um bloqueio, e todas as demais operações esperam ele liberar.
 */
class SqliteDb implements Db {
  readonly dialect = 'sqlite' as const
  private conn: import('node:sqlite').DatabaseSync
  private inner: SqliteTxDb
  /** Fila de execução: garante que nada entra na conexão enquanto uma transação está aberta. */
  private tail: Promise<void> = Promise.resolve()

  constructor(conn: import('node:sqlite').DatabaseSync) {
    this.conn = conn
    this.inner = new SqliteTxDb(conn)
  }

  private acquire(): Promise<() => void> {
    let release: () => void = () => {}
    const mine = new Promise<void>((r) => {
      release = r
    })
    const prev = this.tail
    this.tail = prev.then(() => mine)
    return prev.then(() => release)
  }

  async get<T = Row>(sql: string, params: Param[] = []): Promise<T | undefined> {
    const release = await this.acquire()
    try {
      return await this.inner.get<T>(sql, params)
    } finally {
      release()
    }
  }

  async all<T = Row>(sql: string, params: Param[] = []): Promise<T[]> {
    const release = await this.acquire()
    try {
      return await this.inner.all<T>(sql, params)
    } finally {
      release()
    }
  }

  async run(sql: string, params: Param[] = []): Promise<{ changes: number }> {
    const release = await this.acquire()
    try {
      return await this.inner.run(sql, params)
    } finally {
      release()
    }
  }

  async exec(sql: string): Promise<void> {
    const release = await this.acquire()
    try {
      await this.inner.exec(sql)
    } finally {
      release()
    }
  }

  async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
    const release = await this.acquire()
    try {
      this.conn.exec('BEGIN')
      try {
        const result = await fn(this.inner)
        this.conn.exec('COMMIT')
        return result
      } catch (err) {
        try {
          this.conn.exec('ROLLBACK')
        } catch {
          /* ignore */
        }
        throw err
      }
    } finally {
      release()
    }
  }

  async close(): Promise<void> {
    this.conn.close()
  }
}

async function openSqlite(file: string): Promise<Db> {
  const { DatabaseSync } = await import('node:sqlite')
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true })
  const conn = new DatabaseSync(file)
  conn.exec('PRAGMA journal_mode = WAL')
  conn.exec('PRAGMA foreign_keys = ON')
  conn.exec('PRAGMA busy_timeout = 5000')
  return new SqliteDb(conn)
}

/* ------------------------------------------------------------------ */
/* Postgres (pg) e PGlite (testes)                                     */
/* ------------------------------------------------------------------ */

/** Converte placeholders `?` em `$1..$n` (ignora `?` dentro de literais). */
export function toPgPlaceholders(sql: string): string {
  let n = 0
  let out = ''
  let inString = false
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]
    if (ch === "'") inString = !inString
    if (ch === '?' && !inString) {
      n++
      out += `$${n}`
    } else {
      out += ch
    }
  }
  return out
}

interface PgLikeQueryable {
  query(sql: string, params?: unknown[]): Promise<{ rows: Row[]; rowCount?: number | null; affectedRows?: number }>
  /** Executa SQL com várias instruções (DDL), pelo protocolo simples. */
  exec(sql: string): Promise<void>
}

class PgBaseDb implements Db {
  readonly dialect = 'postgres' as const
  protected q: PgLikeQueryable
  private txRunner: (<T>(fn: (tx: Db) => Promise<T>) => Promise<T>) | null

  constructor(q: PgLikeQueryable, txRunner: (<T>(fn: (tx: Db) => Promise<T>) => Promise<T>) | null) {
    this.q = q
    this.txRunner = txRunner
  }

  async get<T = Row>(sql: string, params: Param[] = []): Promise<T | undefined> {
    const res = await this.q.query(toPgPlaceholders(sql), normalizeParams(params))
    return normalizeRow<T>(res.rows[0])
  }

  async all<T = Row>(sql: string, params: Param[] = []): Promise<T[]> {
    const res = await this.q.query(toPgPlaceholders(sql), normalizeParams(params))
    return res.rows.map((r) => normalizeRow<T>(r) as T)
  }

  async run(sql: string, params: Param[] = []): Promise<{ changes: number }> {
    const res = await this.q.query(toPgPlaceholders(sql), normalizeParams(params))
    return { changes: Number(res.rowCount ?? res.affectedRows ?? 0) }
  }

  async exec(sql: string): Promise<void> {
    await this.q.exec(sql)
  }

  async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
    // Dentro de uma transação já aberta (tx sem runner), apenas continua nela.
    if (!this.txRunner) return fn(this)
    return this.txRunner(fn)
  }

  async close(): Promise<void> {
    /* fechado pelo dono do pool */
  }
}

/**
 * Prepara a URL para o driver `pg`.
 *
 * O `pg` deixa o `sslmode` da URL sobrepor a opção `ssl` passada no código, e
 * as semânticas mudaram entre versões. Para o comportamento ser previsível, o
 * parâmetro é removido da URL e o SSL é decidido aqui:
 *  - sslmode=disable ou host local: sem SSL;
 *  - demais casos (Supabase, Neon...): SSL ligado. Por padrão sem validar a
 *    cadeia de certificados (funciona com qualquer provedor); com
 *    IMPRESSO_DB_SSL=verify a cadeia é validada.
 */
export function prepareDatabaseUrl(url: string, env: NodeJS.ProcessEnv = process.env): { connectionString: string; ssl: false | { rejectUnauthorized: boolean } } {
  const u = new URL(url)
  const sslmode = u.searchParams.get('sslmode')
  u.searchParams.delete('sslmode')
  u.searchParams.delete('uselibpqcompat')
  const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(u.hostname)
  const ssl = sslmode === 'disable' || (local && !sslmode) ? false : { rejectUnauthorized: env.IMPRESSO_DB_SSL === 'verify' }
  return { connectionString: u.toString(), ssl }
}

async function openPostgres(url: string): Promise<Db> {
  const pg = await import('pg')
  // int8 (COUNT, SUM de inteiros) e numeric chegam como texto por padrão; aqui viram número.
  pg.types.setTypeParser(20, (v: string) => Number(v))
  pg.types.setTypeParser(1700, (v: string) => Number(v))
  const { connectionString, ssl } = prepareDatabaseUrl(url)
  const pool = new pg.Pool({ connectionString, max: 5, ssl, connectionTimeoutMillis: 15000 })
  pool.on('error', (err) => console.error('[db] erro no pool Postgres:', err.message))
  // Sem parâmetros o pg usa o protocolo simples, que aceita várias instruções.
  const wrap = (c: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Row[]; rowCount: number | null }> }): PgLikeQueryable => ({
    query: (sql, params) => c.query(sql, params),
    exec: async (sql) => {
      await c.query(sql)
    },
  })
  const txRunner = async <T>(fn: (tx: Db) => Promise<T>): Promise<T> => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const result = await fn(new PgBaseDb(wrap(client), null))
      await client.query('COMMIT')
      return result
    } catch (err) {
      try {
        await client.query('ROLLBACK')
      } catch {
        /* ignore */
      }
      throw err
    } finally {
      client.release()
    }
  }
  const db = new PgBaseDb(wrap(pool), txRunner)
  db.close = async () => {
    await pool.end()
  }
  await db.get('SELECT 1 AS ok')
  return db
}

/** Postgres em memória (WASM) para testes automatizados, sem servidor. */
async function openPglite(): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite')
  const lite = new PGlite()
  await lite.waitReady
  const parsers = { 20: (v: string) => Number(v), 1700: (v: string) => Number(v) }
  const q: PgLikeQueryable = {
    query: async (sql, params) => {
      const r = await lite.query<Row>(sql, params ?? [], { parsers })
      return { rows: r.rows, affectedRows: r.affectedRows }
    },
    exec: async (sql) => {
      await lite.exec(sql)
    },
  }
  const txRunner = <T>(fn: (tx: Db) => Promise<T>): Promise<T> =>
    lite.transaction(async (tx) => {
      const tq: PgLikeQueryable = {
        query: async (sql, params) => {
          const r = await tx.query<Row>(sql, params ?? [], { parsers })
          return { rows: r.rows, affectedRows: r.affectedRows }
        },
        exec: async (sql) => {
          await tx.exec(sql)
        },
      }
      return fn(new PgBaseDb(tq, null))
    })
  const db = new PgBaseDb(q, txRunner)
  db.close = async () => {
    await lite.close()
  }
  return db
}

/* ------------------------------------------------------------------ */
/* Abertura                                                            */
/* ------------------------------------------------------------------ */

let dbPromise: Promise<Db> | null = null
let dbInstance: Db | null = null

export function describeDatabase(): { kind: 'sqlite' | 'postgres' | 'pglite'; target: string } {
  const url = config.databaseUrl
  if (url && /^postgres(ql)?:\/\//i.test(url)) {
    try {
      const u = new URL(url)
      return { kind: 'postgres', target: `${u.hostname}${u.pathname}` }
    } catch {
      return { kind: 'postgres', target: '(URL inválida)' }
    }
  }
  if (url === 'pglite://memory') return { kind: 'pglite', target: 'memória' }
  return { kind: 'sqlite', target: config.dbPath }
}

/** Abre (uma vez) o banco configurado e aplica as migrações. */
export function getDb(): Promise<Db> {
  if (dbPromise) return dbPromise
  dbPromise = (async () => {
    const info = describeDatabase()
    const db =
      info.kind === 'postgres' ? await openPostgres(config.databaseUrl!) : info.kind === 'pglite' ? await openPglite() : await openSqlite(config.dbPath)
    await migrate(db)
    dbInstance = db
    return db
  })()
  return dbPromise
}

export async function closeDb(): Promise<void> {
  if (dbInstance) {
    await dbInstance.close()
    dbInstance = null
  }
  dbPromise = null
}

/* ------------------------------------------------------------------ */
/* Configurações (tabela settings)                                     */
/* ------------------------------------------------------------------ */

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb()
  const row = await db.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key])
  return row ? row.value : null
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb()
  await db.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', [key, value])
}

export async function getJsonSetting<T>(key: string, fallback: T): Promise<T> {
  const raw = await getSetting(key)
  if (raw == null) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export async function setJsonSetting(key: string, value: unknown): Promise<void> {
  await setSetting(key, JSON.stringify(value))
}
