import type { ColunaFiltro, Lead } from '@/types/lead'
import { formatarCpfCnpj, formatarTelefone } from '@/lib/masks'

export type TipoEditor = 'texto' | 'doc' | 'tel' | 'email' | 'cidade' | 'interesse'

export interface ColunaDef {
  id: string
  label: string
  /** chave de filtro/ordenação no servidor */
  filtro?: ColunaFiltro
  editor?: TipoEditor
  /** campo do lead editado (para editores simples) */
  campo?: keyof Lead
  largura: number
  min?: number
  formatarValor?: (v: string) => string
}

export const COLUNAS: ColunaDef[] = [
  { id: 'sel', label: '', largura: 34, min: 34 },
  { id: 'codigo', label: 'Código', filtro: 'codigo', largura: 100, min: 70 },
  { id: 'nome', label: 'Nome', filtro: 'nome', editor: 'texto', campo: 'nome', largura: 160, min: 120 },
  { id: 'empresa', label: 'Empresa', filtro: 'empresa', editor: 'texto', campo: 'empresa', largura: 128, min: 90 },
  { id: 'cpf_cnpj', label: 'CPF/CNPJ', filtro: 'cpf_cnpj', editor: 'doc', campo: 'cpf_cnpj', largura: 136, min: 110, formatarValor: formatarCpfCnpj },
  { id: 'telefone', label: 'Telefone', filtro: 'telefone', editor: 'tel', campo: 'telefone', largura: 124, min: 110, formatarValor: formatarTelefone },
  { id: 'email', label: 'E-mail', filtro: 'email', editor: 'email', campo: 'email', largura: 160, min: 110 },
  { id: 'cidade_uf', label: 'Cidade/UF', filtro: 'cidade_uf', editor: 'cidade', largura: 140, min: 110 },
  { id: 'interesse', label: 'Interesse', filtro: 'interesse', editor: 'interesse', campo: 'interesse', largura: 104, min: 96 },
  { id: 'acoes', label: 'Ações', largura: 96, min: 96 },
]

export const ORDEM_DESKTOP = ['sel', 'codigo', 'nome', 'empresa', 'cpf_cnpj', 'telefone', 'email', 'cidade_uf', 'interesse', 'acoes']
export const ORDEM_MOBILE = ['nome', 'codigo', 'interesse', 'empresa', 'telefone', 'cidade_uf', 'cpf_cnpj', 'acoes']

export const LABEL_COLUNA: Record<ColunaFiltro, string> = {
  codigo: 'Código',
  nome: 'Nome',
  empresa: 'Empresa',
  cpf_cnpj: 'CPF/CNPJ',
  telefone: 'Telefone',
  email: 'E-mail',
  cidade_uf: 'Cidade/UF',
  uf: 'UF',
  interesse: 'Interesse',
}

export const cidadeUf = (l: Pick<Lead, 'cidade' | 'uf'>) => (l.cidade ? `${l.cidade}${l.uf ? '/' + l.uf : ''}` : '')
