import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { extrairDatabaseUrl, interpretarPorta } from './startup.js'

const here = path.dirname(fileURLToPath(import.meta.url))
// Em desenvolvimento: <repo>/server/src/lib -> raiz = ../../..
// Em produção (dist/server/src/lib) -> raiz = ../../../..
const compiled = /[\\/]dist[\\/]server[\\/]src[\\/]lib$/.test(here)
const repoRoot = compiled ? path.resolve(here, '..', '..', '..', '..') : path.resolve(here, '..', '..', '..')

const dataDir = process.env.IMPRESSO_DATA_DIR
  ? path.resolve(process.env.IMPRESSO_DATA_DIR)
  : path.join(repoRoot, 'data')

/**
 * Identificador estável desta instalação (arquivo data/instance-id). Quando o
 * banco é compartilhado por várias máquinas (Postgres na nuvem), impressoras e
 * trabalhos em andamento são separados por instância.
 */
function loadInstanceId(): string {
  const file = path.join(dataDir, 'instance-id')
  try {
    const existing = fs.readFileSync(file, 'utf8').trim()
    if (/^[\w-]{8,64}$/.test(existing)) return existing
  } catch {
    /* ainda não existe */
  }
  const id = crypto.randomUUID()
  try {
    fs.mkdirSync(dataDir, { recursive: true })
    fs.writeFileSync(file, id + '\n', 'utf8')
  } catch {
    /* sem disco gravável: id só desta execução */
  }
  return id
}

/** Endereços IPv4 locais (rede do escritório) para acesso pelo celular. */
export function lanAddresses(): string[] {
  const out: string[] = []
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list ?? []) {
      if (i.family === 'IPv4' && !i.internal) out.push(i.address)
    }
  }
  return out
}

const porta = interpretarPorta(process.env.PORT)
const bancoUrl = extrairDatabaseUrl(process.env.DATABASE_URL)

export const config = {
  repoRoot,
  /** true quando roda a partir de dist/ (produção); false em desenvolvimento (tsx). */
  compilado: compiled,
  dataDir,
  instanceId: process.env.IMPRESSO_INSTANCE_ID?.trim() || loadInstanceId(),
  instanceName: os.hostname(),
  /** postgres://... (Supabase, Neon...) para usar um banco na nuvem; vazio = SQLite local. */
  databaseUrl: bancoUrl.url,
  /** Valor original de DATABASE_URL quando foi preciso limpar (psql "...") ou ignorar; null quando estava certo. */
  databaseUrlOriginal: bancoUrl.original,
  databaseUrlIgnorada: bancoUrl.ignorada,
  dbPath: process.env.IMPRESSO_DB_PATH ? path.resolve(process.env.IMPRESSO_DB_PATH) : path.join(dataDir, 'impress-o.sqlite'),
  uploadsDir: path.join(dataDir, 'uploads'),
  printOutputDir: path.join(dataDir, 'print-output'),
  clientDist: path.join(repoRoot, 'dist', 'client'),
  port: porta.port,
  /** true quando PORT foi definida (válida) pelo usuário: sem tentar outras portas automaticamente. */
  portDefinida: porta.origem === 'env',
  /** Valor de PORT rejeitado (não numérico ou fora de 1..65535), para avisar; null quando OK. */
  portInvalida: porta.origem === 'invalida' ? String(process.env.PORT) : null,
  host: process.env.HOST?.trim() || '127.0.0.1',
  /** Valor de HOST informado pelo usuário (vazio = padrão: só este computador, em IPv4 e IPv6). */
  hostDefinido: process.env.HOST?.trim() || undefined,
  /** Abre o navegador padrão assim que o servidor estiver pronto (usado por iniciar.bat / iniciar.sh). */
  abrirNavegador: process.env.IMPRESSO_OPEN_BROWSER === '1',
  /** true quando o servidor aceita conexões da rede local (HOST=0.0.0.0), para acesso pelo celular. */
  get lanEnabled(): boolean {
    return this.host === '0.0.0.0' || this.host === '::'
  },
  /** URLs para abrir no celular (mesma rede Wi-Fi). */
  get lanUrls(): string[] {
    if (!this.lanEnabled) return []
    return lanAddresses().map((ip) => `http://${ip}:${this.port}`)
  },
  sessionTtlHours: 24 * 7,
  /** Marca o cookie de sessão como Secure (use quando o sistema estiver atrás de HTTPS). */
  secureCookies: process.env.IMPRESSO_SECURE_COOKIES === '1',
  platform: os.platform(),
  isTest: process.env.NODE_ENV === 'test' || process.env.VITEST === 'true',
}
