/**
 * Abstração da impressora de cartões.
 *
 * O caminho principal para a Entrust Sigma DS (DS1/DS2/DS3) é o driver oficial
 * instalado no sistema operacional: a aplicação gera a imagem do cartão em
 * 300 dpi (1013 × 638 px) e a envia para a fila da impressora como um trabalho
 * comum, sem margens e no tamanho de papel CR80. O driver cuida do protocolo
 * proprietário (USB ou rede).
 */

export type PrinterAdapterKind = 'system' | 'mock'

export interface PrinterConfig {
  id: number
  name: string
  adapter: PrinterAdapterKind
  /** Nome exato da impressora no sistema operacional (Windows / CUPS). */
  systemName: string | null
  /** IP/host da impressora em rede (opcional, para checagem de conectividade / Printer Manager). */
  host: string | null
  model: string
  dpi: number
  duplex: boolean
  isDefault: boolean
  options: PrinterOptions
}

export interface PrinterOptions {
  /** Windows: nome do tamanho de papel do driver (ex.: "CR80"); vazio = detectar/definir custom. */
  paperName?: string
  /** CUPS: valor de -o media= (ex.: "Custom.85.6x54mm"). */
  cupsMedia?: string
  /** Opções extras do CUPS ("-o chave=valor", separadas por espaço). */
  cupsExtra?: string
  /** Girar a imagem 180° antes de enviar (ajuste de orientação de alimentação). */
  rotate180?: boolean
  /** Copiar o PNG gerado para uma pasta de saída além de imprimir (auditoria). */
  keepOutput?: boolean
}

export interface PrintJobRequest {
  /** PNG da frente, exatamente no tamanho do cartão a 300 dpi. */
  frontPng: Buffer
  /** PNG do verso (opcional). */
  backPng?: Buffer | null
  orientation: 'landscape' | 'portrait'
  copies: number
  /** Nome do trabalho na fila. */
  jobName: string
  /** Pasta onde os arquivos do trabalho podem ser gravados. */
  workDir: string
}

export interface PrintResult {
  ok: boolean
  /** Identificador retornado pelo sistema (id do CUPS, etc.). */
  systemJobId?: string | null
  /** Caminho de saída (mock) ou arquivo enviado. */
  outputPath?: string | null
  message: string
  /** Detalhes técnicos (stdout/stderr) para diagnóstico. */
  details?: string
}

export interface PrinterStatus {
  reachable: boolean
  state: 'ready' | 'busy' | 'offline' | 'unknown'
  message: string
  details?: Record<string, unknown>
}

export interface SystemPrinterInfo {
  name: string
  driver?: string
  port?: string
  status?: string
  isDefault?: boolean
  /** Indica se parece uma Entrust/Datacard Sigma. */
  looksLikeSigma: boolean
}

export interface PrinterAdapter {
  kind: PrinterAdapterKind
  print(config: PrinterConfig, job: PrintJobRequest): Promise<PrintResult>
  status(config: PrinterConfig): Promise<PrinterStatus>
}
