/**
 * Camada de acesso ao SQLite usando o módulo nativo `node:sqlite` (Node >= 22.13),
 * sem dependências nativas para compilar na máquina do usuário.
 */
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'

export type Row = Record<string, SQLInputValue | null>

let db: DatabaseSync | null = null

export function getDb(): DatabaseSync {
  if (db) return db
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true })
  db = new DatabaseSync(config.dbPath)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA busy_timeout = 5000')
  migrate(db)
  return db
}

/** Abre um banco em memória (usado pelos testes). */
export function openMemoryDb(): DatabaseSync {
  const mem = new DatabaseSync(':memory:')
  mem.exec('PRAGMA foreign_keys = ON')
  migrate(mem)
  db = mem
  return mem
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}

/* ------------------------------------------------------------------ */
/* Migrações                                                           */
/* ------------------------------------------------------------------ */

const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      -- Usuário único do sistema
      CREATE TABLE IF NOT EXISTS user_account (
        id            INTEGER PRIMARY KEY CHECK (id = 1),
        name          TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at    TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS sessions (
        token      TEXT PRIMARY KEY,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS companies (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL,
        cnpj       TEXT,
        logo_asset_id INTEGER,
        default_template_id INTEGER,
        notes      TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS departments (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name       TEXT NOT NULL,
        color      TEXT,
        default_template_id INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (company_id, name)
      );

      -- Arquivos binários (fotos, logos, fundos) gravados em disco; aqui só metadados
      CREATE TABLE IF NOT EXISTS assets (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        kind       TEXT NOT NULL CHECK (kind IN ('photo','logo','background','other')),
        mime       TEXT NOT NULL,
        file_name  TEXT NOT NULL,
        width      INTEGER,
        height     INTEGER,
        size_bytes INTEGER NOT NULL,
        sha256     TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- Modelos (layouts) de cartão. design_json guarda o documento do editor.
      CREATE TABLE IF NOT EXISTS templates (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        name          TEXT NOT NULL,
        company_id    INTEGER REFERENCES companies(id) ON DELETE SET NULL,
        department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
        orientation   TEXT NOT NULL DEFAULT 'landscape' CHECK (orientation IN ('landscape','portrait')),
        double_sided  INTEGER NOT NULL DEFAULT 0,
        design_json   TEXT NOT NULL,
        thumbnail     TEXT,
        source        TEXT NOT NULL DEFAULT 'editor' CHECK (source IN ('editor','import','builtin')),
        created_at    TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- Pessoas / titulares dos cartões
      CREATE TABLE IF NOT EXISTS persons (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
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
        created_at    TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_persons_company ON persons(company_id);
      CREATE INDEX IF NOT EXISTS idx_persons_department ON persons(department_id);

      -- Impressoras configuradas
      CREATE TABLE IF NOT EXISTS printers (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        name         TEXT NOT NULL,
        adapter      TEXT NOT NULL CHECK (adapter IN ('system','mock')),
        system_name  TEXT,
        host         TEXT,
        model        TEXT NOT NULL DEFAULT 'Entrust Sigma DS',
        dpi          INTEGER NOT NULL DEFAULT 300,
        duplex       INTEGER NOT NULL DEFAULT 0,
        is_default   INTEGER NOT NULL DEFAULT 0,
        options_json TEXT NOT NULL DEFAULT '{}',
        created_at   TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- Trabalhos de impressão (histórico + custo registrado no momento)
      CREATE TABLE IF NOT EXISTS print_jobs (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
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
        unit_cost     REAL,
        total_cost    REAL,
        output_path   TEXT,
        created_at    TEXT NOT NULL DEFAULT (datetime('now')),
        finished_at   TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_print_jobs_created ON print_jobs(created_at);

      -- Parâmetros de custo (uma linha ativa, histórico opcional)
      CREATE TABLE IF NOT EXISTS cost_profiles (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL,
        params_json TEXT NOT NULL,
        is_active  INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `,
  },
]

function migrate(conn: DatabaseSync): void {
  conn.exec(`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)`)
  const row = conn.prepare('SELECT MAX(version) AS v FROM schema_version').get() as unknown as { v: number | null }
  const current = row?.v ?? 0
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue
    conn.exec('BEGIN')
    try {
      conn.exec(m.sql)
      conn.prepare('INSERT INTO schema_version (version) VALUES (?)').run(m.version)
      conn.exec('COMMIT')
    } catch (err) {
      conn.exec('ROLLBACK')
      throw err
    }
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function nowIso(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19)
}

export function getSetting(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as unknown as { value: string } | undefined
  return row ? row.value : null
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value)
}

export function getJsonSetting<T>(key: string, fallback: T): T {
  const raw = getSetting(key)
  if (raw == null) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function setJsonSetting(key: string, value: unknown): void {
  setSetting(key, JSON.stringify(value))
}
