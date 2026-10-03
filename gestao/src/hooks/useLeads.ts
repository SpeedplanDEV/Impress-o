import { useEffect, useMemo, useRef } from 'react'
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { destacar } from '@/lib/highlight'
import type { ColunaFiltro, Lead, LeadInsert, LeadsParams, LeadUpdate } from '@/types/lead'

export const TAMANHO_PAGINA = 200

interface Pagina {
  linhas: Lead[]
  total: number
}

/** Colunas reais usadas para ordenar cada coluna da tabela. */
const ORDEM_DB: Record<ColunaFiltro, string[]> = {
  codigo: ['created_at', 'codigo'],
  nome: ['nome'],
  empresa: ['empresa'],
  cpf_cnpj: ['cpf_cnpj'],
  telefone: ['telefone'],
  email: ['email'],
  cidade_uf: ['cidade', 'uf'],
  uf: ['uf'],
  interesse: ['interesse'],
}

const argsFiltro = (p: LeadsParams) => ({
  p_busca: p.busca.trim() || null,
  p_filtros: p.filtros as Record<string, string[]>,
  p_desde: p.desde ?? null,
})

/** Consulta paginada no servidor (count exato) já com filtros, busca e ordenação. */
async function buscarPagina(p: LeadsParams, de: number, ate: number): Promise<Pagina> {
  let q = supabase.rpc('leads_filtrar', argsFiltro(p), { count: 'exact' })
  for (const col of ORDEM_DB[p.ordenacao.coluna]) {
    q = q.order(col, { ascending: !p.ordenacao.desc, nullsFirst: false })
  }
  q = q.order('id', { ascending: true }) // desempate estável
  const { data, error, count } = await q.range(de, ate)
  if (error) throw error
  return { linhas: (data ?? []) as Lead[], total: count ?? 0 }
}

/** Busca todos os leads filtrados (para exportação), em lotes de 1000. */
export async function buscarTodosLeads(p: LeadsParams): Promise<Lead[]> {
  const todos: Lead[] = []
  for (let de = 0; ; de += 1000) {
    const { linhas, total } = await buscarPagina(p, de, de + 999)
    todos.push(...linhas)
    if (linhas.length < 1000 || todos.length >= total) break
  }
  return todos
}

export const chaveLeads = (p: LeadsParams) => ['leads', 'lista', p] as const

export function useLeads(params: LeadsParams) {
  const q = useInfiniteQuery({
    queryKey: chaveLeads(params),
    initialPageParam: 0,
    queryFn: ({ pageParam }) => buscarPagina(params, pageParam, pageParam + TAMANHO_PAGINA - 1),
    getNextPageParam: (ultima, paginas) => {
      const carregadas = paginas.reduce((s, pg) => s + pg.linhas.length, 0)
      return carregadas < ultima.total && ultima.linhas.length > 0 ? carregadas : undefined
    },
    placeholderData: (anterior) => anterior,
  })
  const linhas = useMemo(() => q.data?.pages.flatMap((pg) => pg.linhas) ?? [], [q.data])
  const total = q.data?.pages[0]?.total ?? 0
  return { ...q, linhas, total }
}

/** Valores únicos + contagem de uma coluna (popover de filtro). */
export function useValoresColuna(coluna: ColunaFiltro, params: LeadsParams, ativo: boolean) {
  return useQuery({
    queryKey: ['leads', 'valores', coluna, params.busca, params.filtros, params.desde],
    enabled: ativo,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('leads_valores_coluna', { ...argsFiltro(params), p_coluna: coluna })
      if (error) throw error
      return (data ?? []).map((v) => ({ valor: v.valor, total: Number(v.total) }))
    },
  })
}

type Cache = InfiniteData<Pagina, number>

function atualizarCache(qc: ReturnType<typeof useQueryClient>, fn: (l: Lead) => Lead | null) {
  qc.setQueriesData<Cache>({ queryKey: ['leads', 'lista'] }, (old) => {
    if (!old) return old
    let removidos = 0
    const pages = old.pages.map((pg) => {
      const linhas: Lead[] = []
      for (const l of pg.linhas) {
        const n = fn(l)
        if (n) linhas.push(n)
        else removidos++
      }
      return { ...pg, linhas }
    })
    return { ...old, pages: pages.map((pg) => ({ ...pg, total: Math.max(0, pg.total - removidos) })) }
  })
}

export function useCriarLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (novo: LeadInsert) => {
      const { data, error } = await supabase.from('leads').insert(novo).select().single()
      if (error) throw error
      return data as Lead
    },
    onSuccess: (lead) => {
      destacar(lead.id)
      qc.invalidateQueries({ queryKey: ['leads'] })
    },
  })
}

/** Atualização otimista: aplica no cache imediatamente e desfaz em caso de erro. */
export function useAtualizarLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, dados }: { id: string; dados: LeadUpdate }) => {
      const { data, error } = await supabase.from('leads').update(dados).eq('id', id).select().single()
      if (error) throw error
      return data as Lead
    },
    onMutate: async ({ id, dados }) => {
      await qc.cancelQueries({ queryKey: ['leads', 'lista'] })
      const snapshot = qc.getQueriesData<Cache>({ queryKey: ['leads', 'lista'] })
      atualizarCache(qc, (l) => (l.id === id ? { ...l, ...dados } : l))
      return { snapshot }
    },
    onError: (_e, _v, ctx) => ctx?.snapshot.forEach(([k, d]) => qc.setQueryData(k, d)),
    onSettled: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  })
}

export function useExcluirLeads() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from('leads').delete().in('id', ids)
      if (error) throw error
    },
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: ['leads', 'lista'] })
      const snapshot = qc.getQueriesData<Cache>({ queryKey: ['leads', 'lista'] })
      const set = new Set(ids)
      atualizarCache(qc, (l) => (set.has(l.id) ? null : l))
      return { snapshot }
    },
    onError: (_e, _v, ctx) => ctx?.snapshot.forEach(([k, d]) => qc.setQueryData(k, d)),
    onSettled: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  })
}

/** Assina mudanças da tabela leads (Supabase Realtime) e atualiza a lista ao vivo. */
export function useLeadsRealtime(habilitado = true) {
  const qc = useQueryClient()
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => {
    if (!habilitado) return
    const canal = supabase
      .channel('leads-ao-vivo')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, (payload) => {
        if (payload.eventType === 'INSERT') destacar((payload.new as Lead).id)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => qc.invalidateQueries({ queryKey: ['leads'] }), 250)
      })
      .subscribe()
    return () => {
      clearTimeout(timer.current)
      supabase.removeChannel(canal)
    }
  }, [qc, habilitado])
}

/** Busca rápida para o command palette (máx. 5). */
export async function buscarLeadsRapido(termo: string): Promise<Lead[]> {
  const { data, error } = await supabase
    .rpc('leads_filtrar', { p_busca: termo, p_filtros: {}, p_desde: null })
    .order('nome')
    .limit(5)
  if (error) throw error
  return (data ?? []) as Lead[]
}

/** Busca rápida em clientes; ignora silenciosamente se o módulo ainda não existe no banco. */
export async function buscarClientesRapido(termo: string): Promise<{ id: string; nome: string }[]> {
  const t = termo.replace(/[%,()]/g, ' ').trim()
  if (!t) return []
  const { data, error } = await (supabase as unknown as { from: (t: string) => any })
    .from('clientes')
    .select('id, nome')
    .ilike('nome', `%${t}%`)
    .limit(5)
  if (error) return []
  return (data ?? []) as { id: string; nome: string }[]
}
