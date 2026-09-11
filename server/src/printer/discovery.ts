import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import os from 'node:os'
import type { SystemPrinterInfo } from './types.js'

const execFileAsync = promisify(execFile)

const SIGMA_RE = /sigma|entrust|datacard/i

/** Lista as impressoras instaladas no sistema operacional. */
export async function listSystemPrinters(): Promise<SystemPrinterInfo[]> {
  const platform = os.platform()
  try {
    if (platform === 'win32') return await listWindows()
    return await listCups()
  } catch (err) {
    console.warn('Falha ao listar impressoras:', err instanceof Error ? err.message : err)
    return []
  }
}

async function listWindows(): Promise<SystemPrinterInfo[]> {
  const script = `
    $ErrorActionPreference = 'Stop'
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $default = (Get-CimInstance -ClassName Win32_Printer | Where-Object { $_.Default }).Name
    Get-CimInstance -ClassName Win32_Printer | Select-Object Name, DriverName, PortName, PrinterStatus, WorkOffline |
      ForEach-Object { [PSCustomObject]@{ name=$_.Name; driver=$_.DriverName; port=$_.PortName; status=[string]$_.PrinterStatus; offline=[bool]$_.WorkOffline; isDefault=($_.Name -eq $default) } } |
      ConvertTo-Json -Compress
  `
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    timeout: 20000,
    windowsHide: true,
  })
  const raw = stdout.trim()
  if (!raw) return []
  const parsed = JSON.parse(raw) as unknown
  const list = (Array.isArray(parsed) ? parsed : [parsed]) as { name: string; driver?: string; port?: string; status?: string; offline?: boolean; isDefault?: boolean }[]
  return list.map((p) => ({
    name: p.name,
    driver: p.driver,
    port: p.port,
    status: p.offline ? 'offline' : winStatus(p.status),
    isDefault: p.isDefault,
    looksLikeSigma: SIGMA_RE.test(`${p.name} ${p.driver ?? ''}`),
  }))
}

function winStatus(code: string | undefined): string {
  switch (code) {
    case '3':
      return 'idle'
    case '4':
      return 'printing'
    case '5':
      return 'warming up'
    case '1':
    case '2':
      return 'unknown'
    default:
      return code ? `status ${code}` : 'unknown'
  }
}

async function listCups(): Promise<SystemPrinterInfo[]> {
  const { stdout } = await execFileAsync('lpstat', ['-p', '-d'], { timeout: 15000 })
  const lines = stdout.split('\n')
  let defaultName: string | null = null
  const printers: SystemPrinterInfo[] = []
  for (const line of lines) {
    const m = /^printer (\S+) (.*)$/.exec(line.trim())
    if (m) {
      printers.push({ name: m[1], status: m[2], looksLikeSigma: SIGMA_RE.test(m[1]) })
      continue
    }
    const d = /^system default destination: (\S+)/.exec(line.trim())
    if (d) defaultName = d[1]
  }
  // Tenta obter o nome do driver/modelo
  try {
    const { stdout: v } = await execFileAsync('lpstat', ['-v'], { timeout: 10000 })
    for (const line of v.split('\n')) {
      const m = /^device for (\S+): (.*)$/.exec(line.trim())
      if (m) {
        const p = printers.find((x) => x.name === m[1])
        if (p) p.port = m[2]
      }
    }
  } catch {
    /* opcional */
  }
  for (const p of printers) {
    p.isDefault = p.name === defaultName
    if (!p.looksLikeSigma && p.port) p.looksLikeSigma = SIGMA_RE.test(p.port)
  }
  return printers
}
