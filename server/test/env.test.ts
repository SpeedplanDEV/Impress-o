import { describe, expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = net.createServer()
    s.listen(0, '127.0.0.1', () => {
      const port = (s.address() as { port: number }).port
      s.close(() => resolve(port))
    })
  })
}

describe('.env', () => {
  it('é lido antes da configuração (PORT e IMPRESSO_DATA_DIR vêm do arquivo)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'impresso-env-'))
    const port = await freePort()
    fs.writeFileSync(path.join(dir, '.env'), `PORT=${port}\nIMPRESSO_DATA_DIR=${path.join(dir, 'dados')}\n`)
    const env = { ...process.env }
    delete env.PORT
    delete env.IMPRESSO_DATA_DIR
    delete env.DATABASE_URL
    const repo = path.resolve(__dirname, '..', '..')
    const child = spawn(process.execPath, [path.join(repo, 'node_modules', 'tsx', 'dist', 'cli.mjs'), path.join(repo, 'server', 'src', 'index.ts')], { cwd: dir, env })
    let out = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (out += d))
    try {
      const deadline = Date.now() + 40000
      while (Date.now() < deadline && !/rodando em/.test(out)) await new Promise((r) => setTimeout(r, 200))
      expect(out).toContain(`http://127.0.0.1:${port}`)
      expect(out).toContain(path.join(dir, 'dados'))
    } finally {
      child.kill()
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }, 60000)
})
