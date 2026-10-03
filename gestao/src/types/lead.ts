export const INTERESSES = ['Planilhas', 'Sistemas', 'Sites', 'Documentos', 'Logos'] as const
export type Interesse = (typeof INTERESSES)[number]

export type Lead = {
  id: string
  codigo: string
  nome: string
  empresa: string | null
  cpf_cnpj: string | null
  telefone: string | null
  email: string | null
  cidade: string | null
  uf: string | null
  ibge_id: number | null
  interesse: Interesse
  created_at: string
  updated_at: string
}

export type LeadInsert = Omit<Lead, 'id' | 'codigo' | 'created_at' | 'updated_at'> & {
  id?: string
  codigo?: string
}
export type LeadUpdate = Partial<LeadInsert>

/** Colunas com filtro estilo Excel (chaves aceitas por lead_valor_coluna no banco). */
export type ColunaFiltro =
  | 'codigo'
  | 'nome'
  | 'empresa'
  | 'cpf_cnpj'
  | 'telefone'
  | 'email'
  | 'cidade_uf'
  | 'uf'
  | 'interesse'

/** Filtros por coluna: lista de valores permitidos ("" = vazias). */
export type FiltrosColuna = Partial<Record<ColunaFiltro, string[]>>

export interface Ordenacao {
  coluna: ColunaFiltro
  desc: boolean
}

export interface LeadsParams {
  busca: string
  filtros: FiltrosColuna
  ordenacao: Ordenacao
  /** ISO — leads criados a partir de (chip "Hoje") */
  desde?: string | null
}

export const INTERESSE_CORES: Record<Interesse, { bg: string; fg: string }> = {
  Planilhas: { bg: '#dcfce7', fg: '#166534' },
  Sistemas: { bg: '#dbeafe', fg: '#1e40af' },
  Sites: { bg: '#ede9fe', fg: '#5b21b6' },
  Documentos: { bg: '#fef3c7', fg: '#92400e' },
  Logos: { bg: '#fce7f3', fg: '#9d174d' },
}
