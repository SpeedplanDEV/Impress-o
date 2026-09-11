import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import type { PrinterAdapter, PrinterConfig, PrintJobRequest, PrintResult, PrinterStatus } from './types.js'
import { buildCardPdf } from '../lib/pdf.js'
import { listSystemPrinters } from './discovery.js'

const execFileAsync = promisify(execFile)

/**
 * Impressão pelo driver do sistema operacional (Entrust Sigma DS Printer Driver).
 *
 *  - Windows: PowerShell + System.Drawing.Printing: desenha o PNG ocupando toda a
 *    página, sem margens, com o tamanho de papel CR80 (3,375" × 2,125"), usando o
 *    tamanho de papel do próprio driver quando disponível.
 *  - macOS/Linux (CUPS): gera um PDF com página exatamente do tamanho do cartão e
 *    envia com `lp -d <fila> -o media=Custom.85.6x54mm`.
 */
export class SystemPrinterAdapter implements PrinterAdapter {
  kind = 'system' as const

  async print(config: PrinterConfig, job: PrintJobRequest): Promise<PrintResult> {
    if (!config.systemName) return { ok: false, message: 'Impressora sem nome de fila do sistema configurado.' }
    fs.mkdirSync(job.workDir, { recursive: true })
    const frontPath = path.join(job.workDir, 'frente.png')
    fs.writeFileSync(frontPath, job.frontPng)
    const backPath = job.backPng ? path.join(job.workDir, 'verso.png') : null
    if (backPath && job.backPng) fs.writeFileSync(backPath, job.backPng)

    try {
      if (os.platform() === 'win32') return await this.printWindows(config, job, frontPath, backPath)
      return await this.printCups(config, job, frontPath, backPath)
    } finally {
      if (!config.options.keepOutput) {
        for (const p of [frontPath, backPath]) {
          if (p) {
            try {
              fs.unlinkSync(p)
            } catch {
              /* ignore */
            }
          }
        }
      }
    }
  }

  private async printWindows(config: PrinterConfig, job: PrintJobRequest, frontPath: string, backPath: string | null): Promise<PrintResult> {
    const scriptPath = path.join(job.workDir, 'print.ps1')
    fs.writeFileSync(scriptPath, WINDOWS_PRINT_SCRIPT, 'utf8')
    const args = [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptPath,
      '-PrinterName',
      config.systemName!,
      '-FrontPath',
      frontPath,
      '-Copies',
      String(Math.max(1, job.copies)),
      '-JobName',
      job.jobName,
      '-Landscape',
      job.orientation === 'landscape' ? '1' : '0',
      '-Duplex',
      backPath && config.duplex ? '1' : '0',
      '-PaperName',
      config.options.paperName ?? '',
      '-Rotate180',
      config.options.rotate180 ? '1' : '0',
    ]
    if (backPath) args.push('-BackPath', backPath)
    try {
      const { stdout, stderr } = await execFileAsync('powershell.exe', args, { timeout: 120000, windowsHide: true })
      const out = stdout.trim()
      const ok = /^OK/m.test(out)
      return {
        ok,
        message: ok ? `Enviado para "${config.systemName}" (${job.copies} cópia(s)).` : `O driver não confirmou o envio: ${out || stderr}`,
        details: [out, stderr].filter(Boolean).join('\n'),
      }
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string; message?: string }
      return { ok: false, message: `Falha ao imprimir via PowerShell: ${e.stderr?.trim() || e.message}`, details: [e.stdout, e.stderr].filter(Boolean).join('\n') }
    }
  }

  private async printCups(config: PrinterConfig, job: PrintJobRequest, frontPath: string, backPath: string | null): Promise<PrintResult> {
    const pdfPath = path.join(job.workDir, 'cartao.pdf')
    const pdf = await buildCardPdf({ frontPng: job.frontPng, backPng: job.backPng ?? null, orientation: job.orientation, rotate180: !!config.options.rotate180 })
    fs.writeFileSync(pdfPath, pdf)
    const media = config.options.cupsMedia?.trim() || 'Custom.85.6x54mm'
    const args = ['-d', config.systemName!, '-n', String(Math.max(1, job.copies)), '-t', job.jobName, '-o', `media=${media}`, '-o', 'print-scaling=none']
    if (backPath && config.duplex) args.push('-o', 'sides=two-sided-long-edge')
    else args.push('-o', 'sides=one-sided')
    if (config.options.cupsExtra) {
      for (const opt of config.options.cupsExtra.split(/\s+/).filter(Boolean)) args.push('-o', opt)
    }
    args.push(pdfPath)
    try {
      const { stdout, stderr } = await execFileAsync('lp', args, { timeout: 60000 })
      const m = /request id is (\S+)/.exec(stdout)
      return { ok: true, systemJobId: m?.[1] ?? null, message: `Enviado para "${config.systemName}" (${job.copies} cópia(s)).`, details: [stdout, stderr].filter(Boolean).join('\n') }
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string; message?: string; code?: string }
      const hint = e.code === 'ENOENT' ? ' (o comando "lp" do CUPS não está disponível neste sistema)' : ''
      return { ok: false, message: `Falha ao enviar para o CUPS${hint}: ${e.stderr?.trim() || e.message}`, details: [e.stdout, e.stderr].filter(Boolean).join('\n') }
    } finally {
      if (!config.options.keepOutput) {
        try {
          fs.unlinkSync(pdfPath)
        } catch {
          /* ignore */
        }
      }
    }
  }

  async status(config: PrinterConfig): Promise<PrinterStatus> {
    const details: Record<string, unknown> = {}
    let state: PrinterStatus['state'] = 'unknown'
    let reachable = false
    const messages: string[] = []

    if (config.systemName) {
      const printers = await listSystemPrinters()
      const found = printers.find((p) => p.name === config.systemName)
      details.systemQueue = found ?? null
      if (found) {
        reachable = true
        const s = (found.status ?? '').toLowerCase()
        state = /offline|disabled|stopped|paused/.test(s) ? 'offline' : /printing|processing|busy/.test(s) ? 'busy' : 'ready'
        messages.push(`Fila "${found.name}" encontrada no sistema (${found.status || 'sem status'}).`)
      } else {
        messages.push(`A fila "${config.systemName}" não foi encontrada no sistema. Verifique se o driver Entrust Sigma DS está instalado.`)
      }
    }

    if (config.systemName && reachable) {
      details.driver = await probeDriver(config.systemName)
    }

    if (config.host) {
      const netCheck = await checkNetwork(config.host)
      details.network = netCheck
      if (netCheck.reachable) {
        messages.push(`Impressora responde em ${config.host} (porta ${netCheck.port}). Printer Manager: http://${config.host}/`)
        if (!config.systemName) {
          reachable = true
          state = 'ready'
        }
      } else {
        messages.push(`Sem resposta de ${config.host} na rede.`)
        if (!config.systemName) state = 'offline'
      }
    }
    if (!config.systemName && !config.host) messages.push('Configure o nome da fila do sistema ou o endereço de rede.')
    return { reachable, state, message: messages.join(' '), details }
  }
}

/** Lê capacidades do driver (tamanhos de papel, resoluções, duplex). */
export async function probeDriver(systemName: string): Promise<unknown> {
  try {
    if (os.platform() === 'win32') {
      const tmp = path.join(os.tmpdir(), `impresso-probe-${process.pid}.ps1`)
      fs.writeFileSync(tmp, WINDOWS_PROBE_SCRIPT, 'utf8')
      const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', tmp, '-PrinterName', systemName], { timeout: 30000, windowsHide: true })
      try {
        fs.unlinkSync(tmp)
      } catch {
        /* ignore */
      }
      return JSON.parse(stdout.trim() || '{}')
    }
    const { stdout } = await execFileAsync('lpoptions', ['-p', systemName, '-l'], { timeout: 15000 })
    return { ok: true, options: stdout.trim().split('\n').filter(Boolean) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Verifica se o host da impressora responde (Printer Manager HTTP/HTTPS ou porta de impressão). */
export async function checkNetwork(host: string): Promise<{ reachable: boolean; port: number | null; latencyMs: number | null }> {
  for (const port of [80, 443, 9100]) {
    const t0 = Date.now()
    const ok = await tcpProbe(host, port, 2500)
    if (ok) return { reachable: true, port, latencyMs: Date.now() - t0 }
  }
  return { reachable: false, port: null, latencyMs: null }
}

function tcpProbe(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    let done = false
    const finish = (v: boolean) => {
      if (done) return
      done = true
      socket.destroy()
      resolve(v)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
    socket.connect(port, host)
  })
}

/**
 * Script PowerShell que imprime o(s) PNG(s) na impressora indicada usando o
 * driver do Windows. Escreve "OK" na saída padrão em caso de sucesso.
 */
export const WINDOWS_PRINT_SCRIPT = String.raw`
param(
  [Parameter(Mandatory=$true)][string]$PrinterName,
  [Parameter(Mandatory=$true)][string]$FrontPath,
  [string]$BackPath = '',
  [int]$Copies = 1,
  [string]$JobName = 'Impress-o',
  [string]$Landscape = '1',
  [string]$Duplex = '0',
  [string]$PaperName = '',
  [string]$Rotate180 = '0',
  [int]$WaitSeconds = 25
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Drawing

$front = [System.Drawing.Image]::FromFile((Resolve-Path -LiteralPath $FrontPath).Path)
$back = $null
if ($BackPath -ne '') { $back = [System.Drawing.Image]::FromFile((Resolve-Path -LiteralPath $BackPath).Path) }
if ($Rotate180 -eq '1') {
  $front.RotateFlip([System.Drawing.RotateFlipType]::Rotate180FlipNone)
  if ($back) { $back.RotateFlip([System.Drawing.RotateFlipType]::Rotate180FlipNone) }
}

$doc = New-Object System.Drawing.Printing.PrintDocument
$doc.DocumentName = $JobName
$doc.PrinterSettings.PrinterName = $PrinterName
if (-not $doc.PrinterSettings.IsValid) { throw "Impressora '$PrinterName' não encontrada no Windows." }
$doc.PrinterSettings.Copies = [int16]$Copies
# Sem a janela de progresso do Windows
$doc.PrintController = New-Object System.Drawing.Printing.StandardPrintController
$doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
$doc.OriginAtMargins = $false

# Tamanho de papel CR80: 3,375 x 2,125 pol = 338 x 213 centésimos de polegada.
# Prefere um tamanho informado pelo próprio driver (por nome ou por dimensão, em qualquer orientação),
# pois drivers de impressoras de cartão costumam ignorar tamanhos personalizados.
$w100 = 338; $h100 = 213
function Near($a, $b) { [Math]::Abs($a - $b) -le 5 }
$paper = $null
if ($PaperName -ne '') {
  $paper = $doc.PrinterSettings.PaperSizes | Where-Object { $_.PaperName -eq $PaperName } | Select-Object -First 1
  if (-not $paper) { $paper = $doc.PrinterSettings.PaperSizes | Where-Object { $_.PaperName -like "*$PaperName*" } | Select-Object -First 1 }
}
if (-not $paper) {
  $paper = $doc.PrinterSettings.PaperSizes | Where-Object {
    ((Near $_.Width $w100) -and (Near $_.Height $h100)) -or ((Near $_.Width $h100) -and (Near $_.Height $w100))
  } | Select-Object -First 1
}
if (-not $paper) {
  foreach ($c in @('CR80', 'CR-80', 'ISO ID-1', 'ID-1', 'ID1', 'Card')) {
    $paper = $doc.PrinterSettings.PaperSizes | Where-Object { $_.PaperName -like "*$c*" } | Select-Object -First 1
    if ($paper) { break }
  }
}
if (-not $paper) {
  $paper = New-Object System.Drawing.Printing.PaperSize('CR80', $w100, $h100)
}
$doc.DefaultPageSettings.PaperSize = $paper
# O sinalizador Landscape gira a página em relação à forma natural do papel.
$paperLandscapeShaped = ($paper.Width -gt $paper.Height)
$imageLandscape = ($Landscape -eq '1')
$doc.DefaultPageSettings.Landscape = ($imageLandscape -ne $paperLandscapeShaped)

# Resolução 300 dpi quando o driver a expõe explicitamente
$r300 = $doc.PrinterSettings.PrinterResolutions | Where-Object { $_.Kind -eq 'Custom' -and $_.X -eq 300 } | Select-Object -First 1
if ($r300) { $doc.DefaultPageSettings.PrinterResolution = $r300 }

if ($Duplex -eq '1' -and $back -and $doc.PrinterSettings.CanDuplex) {
  $doc.PrinterSettings.Duplex = [System.Drawing.Printing.Duplex]::Horizontal
} else {
  $doc.PrinterSettings.Duplex = [System.Drawing.Printing.Duplex]::Simplex
}

$script:pageIndex = 0
$script:pages = @($front)
if ($back) { $script:pages += $back }
$doc.add_PrintPage({
  param($sender, $e)
  $img = $script:pages[$script:pageIndex]
  $g = $e.Graphics
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PageUnit = [System.Drawing.GraphicsUnit]::Display
  # Desenha ocupando a página inteira (sem margens), compensando a margem física informada pelo driver.
  $bounds = $e.PageBounds
  $g.TranslateTransform(-$e.PageSettings.HardMarginX, -$e.PageSettings.HardMarginY)
  $g.DrawImage($img, 0, 0, $bounds.Width, $bounds.Height)
  $script:pageIndex++
  $e.HasMorePages = ($script:pageIndex -lt $script:pages.Count)
})
$doc.Print()
$front.Dispose()
if ($back) { $back.Dispose() }

# Acompanha a fila por alguns segundos para detectar erro do driver/impressora.
$status = 'spooled'
$deadline = (Get-Date).AddSeconds($WaitSeconds)
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds 1000
  $job = Get-CimInstance Win32_PrintJob -ErrorAction SilentlyContinue | Where-Object { $_.Document -eq $JobName -and $_.Name -like "$PrinterName,*" } | Select-Object -First 1
  if (-not $job) { $status = 'done'; break }
  $mask = [int]$job.StatusMask
  if (($mask -band 2) -or ($mask -band 32) -or ($mask -band 64) -or ($mask -band 1024)) {
    throw ("O trabalho ficou com erro na fila do Windows (status: " + $job.JobStatus + ", mask=" + $mask + "). Verifique fita, cartões e a conexão da impressora.")
  }
  if ($mask -band 128) { $status = 'printed'; break }
}
Write-Output ("OK status=" + $status + " printer=" + $PrinterName + " paper=" + $paper.PaperName + " " + $paper.Width + "x" + $paper.Height + " landscapeFlag=" + $doc.DefaultPageSettings.Landscape + " copies=" + $Copies)
`

/** Script PowerShell que lê as capacidades do driver (tamanhos de papel, resoluções, duplex). */
export const WINDOWS_PROBE_SCRIPT = String.raw`
param([Parameter(Mandatory=$true)][string]$PrinterName)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Drawing
$ps = New-Object System.Drawing.Printing.PrinterSettings
$ps.PrinterName = $PrinterName
if (-not $ps.IsValid) { Write-Output '{"ok":false,"error":"printer-not-found"}'; exit 0 }
$d = $ps.DefaultPageSettings
$o = @{
  ok = $true; printer = $ps.PrinterName; supportsColor = $ps.SupportsColor; canDuplex = $ps.CanDuplex
  paperSizes = @($ps.PaperSizes | ForEach-Object { @{ name = $_.PaperName; kind = [string]$_.Kind; width100 = $_.Width; height100 = $_.Height } })
  resolutions = @($ps.PrinterResolutions | ForEach-Object { @{ kind = [string]$_.Kind; x = $_.X; y = $_.Y } })
  default = @{ landscape = $d.Landscape; paper = $d.PaperSize.PaperName; width100 = $d.PaperSize.Width; height100 = $d.PaperSize.Height; hardMarginX = $d.HardMarginX; hardMarginY = $d.HardMarginY }
}
$o | ConvertTo-Json -Depth 6 -Compress
`
