import { useCallback, useState } from 'react'
import { gravar, ler } from '@/lib/storage'
import type { ColunaFiltro, FiltrosColuna, Ordenacao } from '@/types/lead'

const CHAVE_FILTROS = 'sp:leads:filtros'
const CHAVE_ORDEM = 'sp:leads:ordenacao'
export const ORDEM_PADRAO: Ordenacao = { coluna: 'codigo', desc: true }

/** Filtros estilo Excel + ordenação, persistidos na sessão (sessionStorage). */
export function useColumnFilters() {
  const [filtros, setFiltros] = useState<FiltrosColuna>(() => ler(CHAVE_FILTROS, {}, 'session'))
  const [ordenacao, setOrdenacaoState] = useState<Ordenacao>(() => ler(CHAVE_ORDEM, ORDEM_PADRAO, 'session'))

  const aplicar = useCallback((fn: (f: FiltrosColuna) => FiltrosColuna) => {
    setFiltros((atual) => {
      const novo = fn(atual)
      gravar(CHAVE_FILTROS, novo, 'session')
      return novo
    })
  }, [])

  /** Define os valores permitidos de uma coluna; null remove o filtro. */
  const setFiltro = useCallback(
    (coluna: ColunaFiltro, valores: string[] | null) =>
      aplicar((f) => {
        const novo = { ...f }
        if (valores == null) delete novo[coluna]
        else novo[coluna] = valores
        return novo
      }),
    [aplicar],
  )

  const limparTodos = useCallback(() => aplicar(() => ({})), [aplicar])

  const setOrdenacao = useCallback((o: Ordenacao) => {
    setOrdenacaoState(o)
    gravar(CHAVE_ORDEM, o, 'session')
  }, [])

  const alternarOrdenacao = useCallback(
    (coluna: ColunaFiltro) =>
      setOrdenacaoState((o) => {
        const novo = o.coluna === coluna ? { coluna, desc: !o.desc } : { coluna, desc: false }
        gravar(CHAVE_ORDEM, novo, 'session')
        return novo
      }),
    [],
  )

  const ativo = useCallback((coluna: ColunaFiltro) => filtros[coluna] != null, [filtros])
  const quantidadeAtivos = Object.keys(filtros).length

  return { filtros, setFiltro, limparTodos, ativo, quantidadeAtivos, ordenacao, setOrdenacao, alternarOrdenacao }
}
