import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
// Em desenvolvimento: <repo>/server/src/lib -> raiz = ../../..
// Em produção (dist/server/src/lib) -> raiz = ../../../..
const repoRoot = here.includes(`${path.sep}dist${path.sep}`)
  ? path.resolve(here, '..', '..', '..', '..')
  : path.resolve(here, '..', '..', '..')

const dataDir = process.env.IMPRESSO_DATA_DIR
  ? path.resolve(process.env.IMPRESSO_DATA_DIR)
  : path.join(repoRoot, 'data')

export const config = {
  repoRoot,
  dataDir,
  dbPath: process.env.IMPRESSO_DB_PATH ? path.resolve(process.env.IMPRESSO_DB_PATH) : path.join(dataDir, 'impress-o.sqlite'),
  uploadsDir: path.join(dataDir, 'uploads'),
  printOutputDir: path.join(dataDir, 'print-output'),
  clientDist: path.join(repoRoot, 'dist', 'client'),
  port: Number(process.env.PORT ?? 3070),
  host: process.env.HOST ?? '127.0.0.1',
  sessionTtlHours: 24 * 7,
  platform: os.platform(),
  isTest: process.env.NODE_ENV === 'test' || process.env.VITEST === 'true',
}
