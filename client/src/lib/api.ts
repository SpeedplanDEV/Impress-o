/** Cliente HTTP mínimo para a API local. Todas as chamadas usam cookie de sessão. */

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export const NETWORK_ERROR_MESSAGE = 'Não foi possível conectar ao servidor local. Verifique se o Impress-o está em execução.'

/** Mensagem em português para qualquer erro (rede, API ou inesperado). */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message
  if (err instanceof TypeError) return NETWORK_ERROR_MESSAGE
  return err instanceof Error ? err.message : String(err)
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    })
  } catch {
    throw new ApiError(0, NETWORK_ERROR_MESSAGE)
  }
  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = { error: text }
    }
  }
  if (!res.ok) {
    const d = data as { error?: string; result?: { message?: string } } | null
    const msg = d?.error ?? d?.result?.message ?? `Erro ${res.status}`
    if (res.status === 401 && !url.startsWith('/api/auth/')) {
      window.dispatchEvent(new CustomEvent('impresso:unauthorized'))
    }
    throw new ApiError(res.status, msg)
  }
  return data as T
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  put: <T>(url: string, body?: unknown) => request<T>('PUT', url, body ?? {}),
  del: <T>(url: string) => request<T>('DELETE', url),
}

export interface AuthStatus {
  setupDone: boolean
  authenticated: boolean
  userName: string | null
}

export const authApi = {
  status: () => api.get<AuthStatus>('/api/auth/status'),
  setup: (name: string, password: string) => api.post<{ ok: true; userName: string }>('/api/auth/setup', { name, password }),
  login: (password: string) => api.post<{ ok: true; userName: string }>('/api/auth/login', { password }),
  logout: () => api.post<{ ok: true }>('/api/auth/logout'),
  updateAccount: (body: { name?: string; currentPassword?: string; newPassword?: string }) =>
    api.put<{ ok: true; userName: string }>('/api/auth/account', body),
}

/** Lê um arquivo do navegador como data URL (base64). */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export function fileToText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file, 'utf-8')
  })
}

/* ------------------------------------------------------------------ */
/* Endpoints                                                           */
/* ------------------------------------------------------------------ */
import type {
  AppInfo, BuiltinTemplate, CardData, CardTemplateDoc, Company, CostBreakdown, CostParams, CostSummary, Department, Person, Printer,
  PrinterStatus, PrintJob, PrintResult, RibbonSpec, SystemPrinter, TemplateFull, TemplateSummary,
} from './types'

export const companiesApi = {
  list: () => api.get<Company[]>('/api/companies'),
  get: (id: number) => api.get<Company>(`/api/companies/${id}`),
  create: (body: Partial<Company> & { name: string; logoDataUrl?: string | null }) => api.post<Company>('/api/companies', body),
  update: (id: number, body: Partial<Company> & { logoDataUrl?: string | null }) => api.put<Company>(`/api/companies/${id}`, body),
  remove: (id: number) => api.del<{ ok: true }>(`/api/companies/${id}`),
}

export const departmentsApi = {
  list: (companyId?: number | null) => api.get<Department[]>(`/api/departments${companyId ? `?companyId=${companyId}` : ''}`),
  create: (body: { companyId: number; name: string; color?: string | null; defaultTemplateId?: number | null }) => api.post<Department>('/api/departments', body),
  update: (id: number, body: Partial<{ companyId: number; name: string; color: string | null; defaultTemplateId: number | null }>) => api.put<Department>(`/api/departments/${id}`, body),
  remove: (id: number) => api.del<{ ok: true }>(`/api/departments/${id}`),
}

export interface PersonInput {
  companyId?: number | null
  departmentId?: number | null
  fullName: string
  displayName?: string | null
  roleTitle?: string | null
  registration?: string | null
  document?: string | null
  email?: string | null
  phone?: string | null
  validUntil?: string | null
  extra?: Record<string, string>
  templateId?: number | null
  active?: boolean
  photoDataUrl?: string | null
}

export const personsApi = {
  list: (params: { q?: string; companyId?: number | null; departmentId?: number | null; active?: boolean } = {}) => {
    const qs = new URLSearchParams()
    if (params.q) qs.set('q', params.q)
    if (params.companyId) qs.set('companyId', String(params.companyId))
    if (params.departmentId) qs.set('departmentId', String(params.departmentId))
    if (params.active) qs.set('active', '1')
    const s = qs.toString()
    return api.get<Person[]>(`/api/persons${s ? `?${s}` : ''}`)
  },
  get: (id: number) => api.get<Person>(`/api/persons/${id}`),
  create: (body: PersonInput) => api.post<Person>('/api/persons', body),
  update: (id: number, body: Partial<PersonInput>) => api.put<Person>(`/api/persons/${id}`, body),
  remove: (id: number) => api.del<{ ok: true }>(`/api/persons/${id}`),
  importCsv: (body: { csv: string; companyId?: number | null; departmentId?: number | null; createDepartments?: boolean }) =>
    api.post<{ imported: number; createdDepartments: number; errors: string[]; warnings: string[]; extraColumns: string[] }>('/api/persons/import', body),
}

export const templatesApi = {
  list: (companyId?: number | null) => api.get<TemplateSummary[]>(`/api/templates${companyId ? `?companyId=${companyId}` : ''}`),
  get: (id: number) => api.get<TemplateFull>(`/api/templates/${id}`),
  builtin: () => api.get<BuiltinTemplate[]>('/api/templates/builtin'),
  installBuiltin: (key: string) => api.post<TemplateFull>(`/api/templates/builtin/${key}`),
  create: (body: { name: string; companyId?: number | null; departmentId?: number | null; design?: CardTemplateDoc; thumbnail?: string | null }) => api.post<TemplateFull>('/api/templates', body),
  update: (id: number, body: Partial<{ name: string; companyId: number | null; departmentId: number | null; design: CardTemplateDoc; thumbnail: string | null }>) => api.put<TemplateFull>(`/api/templates/${id}`, body),
  import: (body: { design: unknown; name?: string; companyId?: number | null; departmentId?: number | null }) => api.post<TemplateFull>('/api/templates/import', body),
  duplicate: (id: number) => api.post<TemplateFull>(`/api/templates/${id}/duplicate`),
  remove: (id: number) => api.del<{ ok: true }>(`/api/templates/${id}`),
  resolve: (personId: number) => api.get<TemplateFull | null>(`/api/templates/resolve/${personId}`),
  exportUrl: (id: number) => `/api/templates/${id}/export`,
}

export const cardsApi = {
  data: (personId: number) => api.get<CardData>(`/api/cards/data/${personId}`),
  sample: () => api.get<CardData>('/api/cards/sample'),
}

export const printersApi = {
  list: () => api.get<Printer[]>('/api/printers'),
  system: () => api.get<{ platform: string; printers: SystemPrinter[] }>('/api/printers/system'),
  create: (body: Partial<Printer> & { name: string; adapter: 'system' | 'mock' }) => api.post<Printer>('/api/printers', body),
  update: (id: number, body: Partial<Printer>) => api.put<Printer>(`/api/printers/${id}`, body),
  remove: (id: number) => api.del<{ ok: true }>(`/api/printers/${id}`),
  status: (id: number) => api.post<PrinterStatus>(`/api/printers/${id}/status`),
  checkHost: (host: string) => api.post<{ reachable: boolean; port: number | null; latencyMs: number | null }>('/api/printers/check-host', { host }),
}

export const printApi = {
  createJob: (body: {
    printerId?: number
    personId?: number | null
    templateId?: number | null
    personName?: string | null
    templateName?: string | null
    orientation: 'landscape' | 'portrait'
    copies: number
    frontPng: string
    backPng?: string | null
  }) => api.post<{ job: PrintJob; result: PrintResult }>('/api/print/jobs', body),
  jobs: (limit = 100) => api.get<PrintJob[]>(`/api/print/jobs?limit=${limit}`),
  removeJob: (id: number) => api.del<{ ok: true }>(`/api/print/jobs/${id}`),
  outputUrl: (id: number, side: 'frente' | 'verso') => `/api/print/jobs/${id}/output/${side}`,
  /** Baixa um PDF no tamanho do cartão. */
  downloadPdf: async (body: { orientation: 'landscape' | 'portrait'; frontPng: string; backPng?: string | null; fileName?: string }) => {
    const res = await fetch('/api/print/pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!res.ok) {
      const t = await res.text()
      let msg = `Erro ${res.status}`
      try {
        msg = JSON.parse(t).error ?? msg
      } catch {
        /* ignore */
      }
      throw new ApiError(res.status, msg)
    }
    return res.blob()
  },
}

export const costApi = {
  params: () => api.get<{ params: CostParams; defaults: CostParams }>('/api/cost/params'),
  saveParams: (params: CostParams) => api.put<{ params: CostParams }>('/api/cost/params', { params }),
  presets: () => api.get<{ ribbons: RibbonSpec[] }>('/api/cost/presets'),
  calculate: (body: { sides: 1 | 2; quantity: number; params?: CostParams }) => api.post<{ params: CostParams; breakdown: CostBreakdown }>('/api/cost/calculate', body),
  summary: (range?: { from?: string; to?: string }) => {
    const qs = new URLSearchParams()
    if (range?.from) qs.set('from', range.from)
    if (range?.to) qs.set('to', range.to)
    const q = qs.toString()
    return api.get<CostSummary>(`/api/cost/summary${q ? `?${q}` : ''}`)
  },
}

export const settingsApi = {
  get: () => api.get<AppInfo>('/api/settings'),
  save: (body: Partial<AppInfo['settings']>) => api.put<{ settings: AppInfo['settings'] }>('/api/settings', body),
}

/** Dispara o download de um blob/data URL no navegador. */
export function downloadBlob(blob: Blob | string, fileName: string): void {
  const url = typeof blob === 'string' ? blob : URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  if (typeof blob !== 'string') setTimeout(() => URL.revokeObjectURL(url), 5000)
}
