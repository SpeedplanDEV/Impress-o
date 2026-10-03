import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { normalizar } from '@/lib/masks'

export interface Municipio {
  id: number
  nome: string
  uf: string
  /** nome normalizado (sem acento, minúsculo) para busca */
  chave: string
}

const URL_IBGE = 'https://servicosdados.ibge.gov.br/api/v1/localidades/municipios'

interface MunicipioIbge {
  id: number
  nome: string
  microrregiao?: { mesorregiao?: { UF?: { sigla?: string } } } | null
  'regiao-imediata'?: { 'regiao-intermediaria'?: { UF?: { sigla?: string } } } | null
}

async function carregarMunicipios(): Promise<Municipio[]> {
  const r = await fetch(URL_IBGE)
  if (!r.ok) throw new Error('Falha ao carregar municípios do IBGE')
  const dados = (await r.json()) as MunicipioIbge[]
  return dados.map((m) => ({
    id: m.id,
    nome: m.nome,
    // alguns municípios novos vêm sem microrregião: usa a região imediata
    uf:
      m.microrregiao?.mesorregiao?.UF?.sigla ??
      m['regiao-imediata']?.['regiao-intermediaria']?.UF?.sigla ??
      '',
    chave: normalizar(m.nome),
  }))
}

/** Lista completa de municípios do IBGE, cacheada em memória (staleTime infinito). */
export function useIbgeMunicipios() {
  return useQuery({
    queryKey: ['ibge', 'municipios'],
    queryFn: carregarMunicipios,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 2,
  })
}

/** Até `limite` municípios: primeiro os que começam pelo termo, depois os que o contêm. */
export function buscarMunicipios(lista: Municipio[], termo: string, limite = 8): Municipio[] {
  const t = normalizar(termo)
  if (t.length < 3) return []
  const comeca: Municipio[] = []
  const contem: Municipio[] = []
  for (const m of lista) {
    if (m.chave.startsWith(t)) comeca.push(m)
    else if (contem.length < limite && m.chave.includes(t)) contem.push(m)
  }
  comeca.sort((a, b) => a.chave.length - b.chave.length || a.chave.localeCompare(b.chave))
  return [...comeca, ...contem].slice(0, limite)
}

export function useBuscaMunicipios(termo: string, limite = 8) {
  const q = useIbgeMunicipios()
  const resultados = useMemo(() => (q.data ? buscarMunicipios(q.data, termo, limite) : []), [q.data, termo, limite])
  return { resultados, carregando: q.isLoading, erro: q.error }
}
