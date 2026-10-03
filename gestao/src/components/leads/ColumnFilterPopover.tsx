import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { ArrowDownAZ, ArrowDownZA, LoaderCircle, Search } from 'lucide-react'
import { useValoresColuna } from '@/hooks/useLeads'
import { useAncora } from '@/hooks/useAncora'
import { normalizar } from '@/lib/masks'
import { cn } from '@/lib/cn'
import type { ColunaFiltro, LeadsParams } from '@/types/lead'

interface Props {
  coluna: ColunaFiltro
  ancora: HTMLElement
  params: LeadsParams
  filtroAtual: string[] | undefined
  formatar?: (valor: string) => string
  onAplicar: (valores: string[] | null) => void
  onOrdenar: (desc: boolean) => void
  onFechar: () => void
}

const VAZIAS = '(Vazias)'

/** Popover de filtro estilo Excel: ordenar, pesquisar, selecionar valores únicos (com contagem). */
export function ColumnFilterPopover({ coluna, ancora, params, filtroAtual, formatar, onAplicar, onOrdenar, onFechar }: Props) {
  const ancoraRef = useRef<HTMLElement>(ancora)
  ancoraRef.current = ancora
  const pos = useAncora(ancoraRef, true, 440, 268)
  const painel = useRef<HTMLDivElement>(null)
  const [pesquisa, setPesquisa] = useState('')
  const valores = useValoresColuna(coluna, params, true)
  const [marcados, setMarcados] = useState<Set<string> | null>(null)

  const exibir = (v: string) => (v === '' ? VAZIAS : formatar ? formatar(v) : v)

  // seleção inicial: valores do filtro atual, ou todos
  useEffect(() => {
    if (valores.data && marcados == null) {
      setMarcados(new Set(filtroAtual ?? valores.data.map((v) => v.valor)))
    }
  }, [valores.data, filtroAtual, marcados])

  const visiveis = useMemo(() => {
    const t = normalizar(pesquisa)
    const lista = valores.data ?? []
    return t ? lista.filter((v) => normalizar(exibir(v.valor)).includes(t)) : lista
  }, [valores.data, pesquisa])

  const sel = marcados ?? new Set<string>()
  const todosVisiveisMarcados = visiveis.length > 0 && visiveis.every((v) => sel.has(v.valor))
  const algunsVisiveisMarcados = visiveis.some((v) => sel.has(v.valor))

  const alternar = (v: string) =>
    setMarcados((m) => {
      const n = new Set(m)
      if (n.has(v)) n.delete(v)
      else n.add(v)
      return n
    })

  const alternarTodos = () =>
    setMarcados((m) => {
      const n = new Set(m)
      visiveis.forEach((v) => (todosVisiveisMarcados ? n.delete(v.valor) : n.add(v.valor)))
      return n
    })

  const ok = () => {
    const todos = valores.data ?? []
    // com pesquisa, como no Excel, filtra só pelos itens visíveis marcados
    const escolhidos = (pesquisa ? visiveis : todos).filter((v) => sel.has(v.valor)).map((v) => v.valor)
    if (!pesquisa && escolhidos.length === todos.length) onAplicar(null)
    else onAplicar(escolhidos)
    onFechar()
  }

  // fecha ao clicar fora / Esc
  useEffect(() => {
    const fora = (e: MouseEvent) => {
      const alvo = e.target as Node
      if (!painel.current?.contains(alvo) && !ancora.contains(alvo)) onFechar()
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onFechar()
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', fora)
      document.removeEventListener('keydown', esc)
    }
  }, [ancora, onFechar])

  if (!pos) return null
  return createPortal(
    <motion.div
      ref={painel}
      role="dialog"
      aria-label="Filtro da coluna"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.12 }}
      className="fixed z-[70] flex flex-col overflow-hidden rounded-xl bg-surface text-[13px] text-fg shadow-2xl ring-1 ring-line"
      style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT' && ok()}
    >
      <div className="border-b border-line p-1">
        {[
          { desc: false, label: 'Ordenar A → Z', icon: ArrowDownAZ },
          { desc: true, label: 'Ordenar Z → A', icon: ArrowDownZA },
        ].map((o) => (
          <button
            key={o.label}
            type="button"
            onClick={() => {
              onOrdenar(o.desc)
              onFechar()
            }}
            className="flex h-8 w-full items-center gap-2 rounded-md px-2 hover:bg-surface-2"
          >
            <o.icon size={15} className="text-muted" /> {o.label}
          </button>
        ))}
      </div>
      <div className="p-2 pb-1">
        <div className="flex h-8 items-center gap-2 rounded-md border border-line px-2 focus-within:border-primary">
          <Search size={14} className="text-muted" />
          <input
            autoFocus
            value={pesquisa}
            onChange={(e) => setPesquisa(e.target.value)}
            placeholder="Pesquisar"
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted"
          />
        </div>
      </div>
      <div className="scroll-fino min-h-24 flex-1 overflow-y-auto px-1 pb-1">
        {valores.isLoading ? (
          <div className="flex items-center gap-2 px-2 py-3 text-muted">
            <LoaderCircle size={14} className="animate-spin" /> Carregando valores…
          </div>
        ) : valores.isError ? (
          <div className="px-2 py-3 text-red-600">Não foi possível carregar os valores.</div>
        ) : (
          <>
            <label className="flex h-7 cursor-pointer items-center gap-2 rounded-md px-2 hover:bg-surface-2">
              <input
                type="checkbox"
                className="size-3.5 accent-[var(--primary)]"
                checked={todosVisiveisMarcados}
                ref={(el) => {
                  if (el) el.indeterminate = !todosVisiveisMarcados && algunsVisiveisMarcados
                }}
                onChange={alternarTodos}
              />
              <span className="font-medium">(Selecionar tudo)</span>
            </label>
            {visiveis.map((v) => (
              <label
                key={v.valor}
                className="flex h-7 cursor-pointer items-center gap-2 rounded-md px-2 hover:bg-surface-2"
              >
                <input
                  type="checkbox"
                  className="size-3.5 shrink-0 accent-[var(--primary)]"
                  checked={sel.has(v.valor)}
                  onChange={() => alternar(v.valor)}
                />
                <span className={cn('min-w-0 flex-1 truncate', v.valor === '' && 'text-muted italic')}>
                  {exibir(v.valor)}
                </span>
                <span className="text-[11.5px] text-muted tabular-nums">{v.total.toLocaleString('pt-BR')}</span>
              </label>
            ))}
            {visiveis.length === 0 && <div className="px-2 py-3 text-muted">Nenhum valor.</div>}
          </>
        )}
      </div>
      <div className="flex items-center gap-1 border-t border-line p-2">
        <button
          type="button"
          disabled={!filtroAtual}
          onClick={() => {
            onAplicar(null)
            onFechar()
          }}
          className="h-8 rounded-md px-2 text-primary hover:bg-primary-soft disabled:text-muted disabled:hover:bg-transparent"
        >
          Limpar filtro
        </button>
        <span className="flex-1" />
        <button type="button" onClick={onFechar} className="h-8 rounded-md px-3 hover:bg-surface-2">
          Cancelar
        </button>
        <button
          type="button"
          onClick={ok}
          disabled={!valores.data || !algunsVisiveisMarcados}
          className="h-8 rounded-md bg-primary px-4 font-medium text-white hover:bg-primary-hover disabled:opacity-50"
        >
          OK
        </button>
      </div>
    </motion.div>,
    document.body,
  )
}
