import type { PrinterAdapter, PrinterAdapterKind } from './types.js'
import { MockPrinterAdapter } from './mock.js'
import { SystemPrinterAdapter } from './system.js'

const adapters: Record<PrinterAdapterKind, PrinterAdapter> = {
  system: new SystemPrinterAdapter(),
  mock: new MockPrinterAdapter(),
}

export function getAdapter(kind: PrinterAdapterKind): PrinterAdapter {
  return adapters[kind] ?? adapters.mock
}

export * from './types.js'
export { listSystemPrinters } from './discovery.js'
export { checkNetwork } from './system.js'
