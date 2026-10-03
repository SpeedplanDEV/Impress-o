import {
  Briefcase,
  Building2,
  ChartColumn,
  Repeat,
  Settings,
  Tags,
  Target,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

export type Secao = 'COMERCIAL' | 'FINANCEIRO' | 'SISTEMA'

export interface Rota {
  path: string
  label: string
  secao: Secao
  icon: LucideIcon
  /** Atalho Alt+N (1…9) */
  atalho: number
}

/** Fonte única de navegação: sidebar, drawer, bottom nav, command palette e atalhos. */
export const ROTAS: Rota[] = [
  { path: '/leads', label: 'Leads', secao: 'COMERCIAL', icon: Target, atalho: 1 },
  { path: '/clientes', label: 'Clientes', secao: 'COMERCIAL', icon: Users, atalho: 2 },
  { path: '/recorrentes', label: 'Recorrentes', secao: 'COMERCIAL', icon: Repeat, atalho: 3 },
  { path: '/servicos', label: 'Serviços', secao: 'COMERCIAL', icon: Briefcase, atalho: 4 },
  { path: '/financeiro', label: 'Financeiro', secao: 'FINANCEIRO', icon: Wallet, atalho: 5 },
  { path: '/categorias', label: 'Categorias', secao: 'FINANCEIRO', icon: Tags, atalho: 6 },
  { path: '/centros-de-custo', label: 'Centros de custo', secao: 'FINANCEIRO', icon: Building2, atalho: 7 },
  { path: '/relatorios', label: 'Relatórios', secao: 'SISTEMA', icon: ChartColumn, atalho: 8 },
  { path: '/configuracoes', label: 'Configurações', secao: 'SISTEMA', icon: Settings, atalho: 9 },
]

export const SECOES: Secao[] = ['COMERCIAL', 'FINANCEIRO', 'SISTEMA']

export const SECAO_LABEL: Record<Secao, string> = {
  COMERCIAL: 'Comercial',
  FINANCEIRO: 'Financeiro',
  SISTEMA: 'Sistema',
}

export const rotaPorPath = (pathname: string) =>
  ROTAS.find((r) => pathname === r.path || pathname.startsWith(r.path + '/'))
