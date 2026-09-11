import type { CardTemplateDoc, CardData } from '@shared/template'
import type { CostParams, CostBreakdown, RibbonSpec } from '@shared/cost'

export interface Company {
  id: number
  name: string
  cnpj: string | null
  logoAssetId: number | null
  logoUrl: string | null
  defaultTemplateId: number | null
  notes: string | null
  createdAt: string
  updatedAt: string
  departmentsCount: number
  personsCount: number
  departments?: Department[]
}

export interface Department {
  id: number
  companyId: number
  companyName: string | null
  name: string
  color: string | null
  defaultTemplateId: number | null
  personsCount: number
  createdAt: string
  updatedAt: string
}

export interface Person {
  id: number
  companyId: number | null
  companyName: string | null
  departmentId: number | null
  departmentName: string | null
  fullName: string
  displayName: string | null
  roleTitle: string | null
  registration: string | null
  document: string | null
  email: string | null
  phone: string | null
  validUntil: string | null
  photoAssetId: number | null
  photoUrl: string | null
  extra: Record<string, string>
  templateId: number | null
  templateName: string | null
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface TemplateSummary {
  id: number
  name: string
  companyId: number | null
  companyName: string | null
  departmentId: number | null
  departmentName: string | null
  orientation: 'landscape' | 'portrait'
  doubleSided: boolean
  thumbnail: string | null
  source: 'editor' | 'import' | 'builtin'
  createdAt: string
  updatedAt: string
}

export interface TemplateFull extends TemplateSummary {
  design: CardTemplateDoc
}

export interface BuiltinTemplate {
  key: string
  name: string
  description: string
  orientation: 'landscape' | 'portrait'
}

export interface PrinterOptions {
  paperName?: string
  cupsMedia?: string
  cupsExtra?: string
  rotate180?: boolean
  duplexShortEdge?: boolean
  keepOutput?: boolean
}

export interface Printer {
  id: number
  name: string
  adapter: 'system' | 'mock'
  systemName: string | null
  host: string | null
  model: string
  dpi: number
  duplex: boolean
  isDefault: boolean
  options: PrinterOptions
}

export interface SystemPrinter {
  name: string
  driver?: string
  port?: string
  status?: string
  isDefault?: boolean
  looksLikeSigma: boolean
}

export interface PrinterStatus {
  reachable: boolean
  state: 'ready' | 'busy' | 'offline' | 'unknown'
  message: string
  details?: Record<string, unknown>
}

export interface PrintJob {
  id: number
  printerId: number | null
  printerName: string | null
  personId: number | null
  templateId: number | null
  personName: string | null
  templateName: string | null
  copies: number
  sides: number
  status: 'queued' | 'printing' | 'done' | 'error' | 'cancelled'
  error: string | null
  cost: CostBreakdown | null
  unitCost: number | null
  totalCost: number | null
  outputPath: string | null
  createdAt: string
  finishedAt: string | null
}

export interface PrintResult {
  ok: boolean
  systemJobId?: string | null
  outputPath?: string | null
  message: string
  details?: string
}

export interface CostSummary {
  totals: { jobs: number; cards: number; totalCost: number }
  byMonth: { month: string; jobs: number; cards: number; totalCost: number }[]
  byCompany: { company: string; jobs: number; cards: number; totalCost: number }[]
}

export interface AppInfo {
  settings: { organizationName: string; extraFields: string[] }
  paths: { dataDir: string; dbPath: string; uploadsDir: string; printOutputDir: string }
  platform: string
  nodeVersion: string
  counts: { companies: number; departments: number; persons: number; templates: number; printers: number; jobs: number; jobsDone: number; cardsPrinted: number; totalCost: number }
}

export type { CardTemplateDoc, CardData, CostParams, CostBreakdown, RibbonSpec }
