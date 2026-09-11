import fs from 'node:fs'
import path from 'node:path'
import type { PrinterAdapter, PrinterConfig, PrintJobRequest, PrintResult, PrinterStatus } from './types.js'

/**
 * Impressora simulada: grava os PNGs em data/print-output. Útil para testar o
 * fluxo completo sem a Sigma DS conectada e para revisar o resultado exato que
 * seria enviado ao driver.
 */
export class MockPrinterAdapter implements PrinterAdapter {
  kind = 'mock' as const

  async print(_config: PrinterConfig, job: PrintJobRequest): Promise<PrintResult> {
    fs.mkdirSync(job.workDir, { recursive: true })
    const front = path.join(job.workDir, 'frente.png')
    fs.writeFileSync(front, job.frontPng)
    if (job.backPng) fs.writeFileSync(path.join(job.workDir, 'verso.png'), job.backPng)
    return {
      ok: true,
      outputPath: job.workDir,
      message: `Simulação: ${job.copies} cópia(s) gravada(s) em ${job.workDir}`,
    }
  }

  async status(): Promise<PrinterStatus> {
    return { reachable: true, state: 'ready', message: 'Impressora simulada pronta (os cartões são gravados em arquivo).' }
  }
}
