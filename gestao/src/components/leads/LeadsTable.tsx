import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnSizingState,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, Funnel, LoaderCircle, MessageCircle, Pencil, Trash2 } from 'lucide-react'
import type { ColunaFiltro, Lead, LeadsParams, LeadUpdate } from '@/types/lead'
import { formatarCpfCnpj, formatarTelefone, linkWhatsApp } from '@/lib/masks'
import { gravar, ler } from '@/lib/storage'
import { mensagemErro } from '@/lib/erros'
import { useDestaques } from '@/lib/highlight'
import { cn } from '@/lib/cn'
import { useAtualizarLead } from '@/hooks/useLeads'
import { COLUNAS, ORDEM_DESKTOP, ORDEM_MOBILE, cidadeUf, type ColunaDef } from './colunas'
import { ColumnFilterPopover } from './ColumnFilterPopover'
import { CellEditor, type Movimento } from './CellEditor'
import { InlineNewRow } from './InlineNewRow'
import { InteresseBadge } from './InteresseBadge'

interface Props {
  linhas: Lead[]
  total: number
  params: LeadsParams
  desktop: boolean
  carregando: boolean
  carregandoMais: boolean
  temMais: boolean
  carregarMais: () => void
  selecionados: Set<string>
  setSelecionados: (s: Set<string>) => void
  filtroAtivo: (c: ColunaFiltro) => boolean
  onFiltrar: (c: ColunaFiltro, valores: string[] | null) => void
  onOrdenar: (c: ColunaFiltro, desc?: boolean) => void
  onEditar: (l: Lead) => void
  onExcluir: (ids: string[]) => void
}

const CHAVE_LARGURAS = 'sp:leads:larguras'
const DEF = Object.fromEntries(COLUNAS.map((c) => [c.id, c])) as Record<string, ColunaDef>

interface Celula {
  linha: number
  col: string
}

export function LeadsTable(p: Props) {
  const { linhas, desktop, params } = p
  const altura = desktop ? 32 : 34
  const scrollRef = useRef<HTMLDivElement>(null)
  const destaques = useDestaques()
  const atualizar = useAtualizarLead()

  const [larguras, setLarguras] = useState<ColumnSizingState>(() => ler(CHAVE_LARGURAS, {}))
  const [ativa, setAtiva] = useState<Celula | null>(null)
  const [editando, setEditando] = useState<Celula | null>(null)
  const [filtroAberto, setFiltroAberto] = useState<{ col: ColunaFiltro; el: HTMLElement } | null>(null)

  const ordem = desktop ? ORDEM_DESKTOP : ORDEM_MOBILE
  const colunasEditaveis = useMemo(() => ordem.filter((id) => DEF[id].editor), [ordem])

  const columns = useMemo<ColumnDef<Lead>[]>(
    () =>
      COLUNAS.map((c) => ({
        id: c.id,
        size: c.id === 'acoes' && !desktop ? 132 : c.largura,
        minSize: c.min ?? 60,
        maxSize: 640,
        enableResizing: c.id !== 'sel' && c.id !== 'acoes',
        header: c.label,
      })),
    [desktop],
  )

  const tabela = useReactTable({
    data: linhas,
    columns,
    getRowId: (l) => l.id,
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode: 'onChange',
    manualSorting: true,
    manualFiltering: true,
    state: {
      columnSizing: larguras,
      columnOrder: ordem,
      columnVisibility: Object.fromEntries(COLUNAS.map((c) => [c.id, ordem.includes(c.id)])),
    },
    onColumnSizingChange: (u) =>
      setLarguras((atual) => {
        const novo = typeof u === 'function' ? u(atual) : u
        gravar(CHAVE_LARGURAS, novo)
        return novo
      }),
  })

  const headers = tabela.getHeaderGroups()[0].headers
  const larguraTotal = tabela.getTotalSize()
  const colunasLinha = headers.map((h) => ({ id: h.column.id, largura: h.getSize() }))

  // ── Virtualização + carregamento incremental ─────────────────────────────
  const virt = useVirtualizer({
    count: linhas.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => altura,
    overscan: 16,
    scrollPaddingStart: desktop ? 34 : 36,
    scrollPaddingEnd: desktop ? 64 : 0,
  })
  const itens = virt.getVirtualItems()
  const ultimo = itens[itens.length - 1]?.index ?? 0
  const { temMais, carregandoMais, carregarMais } = p
  useEffect(() => {
    if (temMais && !carregandoMais && ultimo >= linhas.length - 40) carregarMais()
  }, [ultimo, linhas.length, temMais, carregandoMais, carregarMais])

  // ── Edição ───────────────────────────────────────────────────────────────
  const focarGrade = () => scrollRef.current?.focus({ preventScroll: true })

  const iniciarEdicao = useCallback(
    (c: Celula) => {
      if (!DEF[c.col]?.editor || !linhas[c.linha]) return
      setAtiva(c)
      setEditando(c)
    },
    [linhas],
  )

  const salvarCelula = (lead: Lead, c: Celula, dados: LeadUpdate | null, mov: Movimento) => {
    if (dados) {
      atualizar.mutate({ id: lead.id, dados }, { onError: (e) => toast.error(mensagemErro(e)) })
    }
    if (mov) {
      const i = colunasEditaveis.indexOf(c.col)
      const prox = colunasEditaveis[i + (mov === 'proxima' ? 1 : -1)]
      if (prox) {
        iniciarEdicao({ linha: c.linha, col: prox })
        return
      }
    }
    setEditando(null)
    focarGrade()
  }

  // ── Teclado: ↑ ↓ ← → navegam, Enter edita ────────────────────────────────
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (editando || e.target !== e.currentTarget || linhas.length === 0) return
    const atual = ativa ?? { linha: -1, col: ordem.find((id) => DEF[id].editor) ?? 'nome' }
    const mover = (c: Celula) => {
      e.preventDefault()
      setAtiva(c)
      virt.scrollToIndex(c.linha, { align: 'auto' })
    }
    const idxCol = ordem.indexOf(atual.col)
    if (e.key === 'ArrowDown') mover({ ...atual, linha: Math.min(linhas.length - 1, atual.linha + 1) })
    else if (e.key === 'ArrowUp') mover({ ...atual, linha: Math.max(0, atual.linha - 1) })
    else if (e.key === 'ArrowRight' && idxCol < ordem.length - 1) mover({ ...atual, col: ordem[idxCol + 1], linha: Math.max(0, atual.linha) })
    else if (e.key === 'ArrowLeft' && idxCol > 0) mover({ ...atual, col: ordem[idxCol - 1], linha: Math.max(0, atual.linha) })
    else if (e.key === 'Enter' && atual.linha >= 0) {
      e.preventDefault()
      const col = DEF[atual.col].editor ? atual.col : colunasEditaveis[0]
      iniciarEdicao({ linha: atual.linha, col })
    } else if (e.key === 'Delete' && p.selecionados.size > 0) {
      e.preventDefault()
      p.onExcluir([...p.selecionados])
    }
  }

  // ── Seleção ──────────────────────────────────────────────────────────────
  const todosSelecionados = linhas.length > 0 && linhas.every((l) => p.selecionados.has(l.id))
  const algunsSelecionados = linhas.some((l) => p.selecionados.has(l.id))
  const alternarSel = (id: string) => {
    const n = new Set(p.selecionados)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    p.setSelecionados(n)
  }

  // ── Conteúdo de cada célula ──────────────────────────────────────────────
  const conteudo = (l: Lead, col: string) => {
    switch (col) {
      case 'sel':
        return (
          <input
            type="checkbox"
            aria-label={`Selecionar ${l.nome}`}
            checked={p.selecionados.has(l.id)}
            onChange={() => alternarSel(l.id)}
            onClick={(e) => e.stopPropagation()}
            className="size-3.5 accent-[var(--primary)]"
          />
        )
      case 'codigo':
        return <span className="font-medium text-muted tabular-nums">{l.codigo}</span>
      case 'nome':
        return <span className="font-medium">{l.nome}</span>
      case 'empresa':
        return l.empresa
      case 'cpf_cnpj':
        return <span className="tabular-nums">{formatarCpfCnpj(l.cpf_cnpj)}</span>
      case 'telefone': {
        const wa = linkWhatsApp(l.telefone)
        return wa ? (
          <a href={wa} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="tabular-nums text-link hover:underline">
            {formatarTelefone(l.telefone)}
          </a>
        ) : (
          formatarTelefone(l.telefone)
        )
      }
      case 'email':
        return l.email ? (
          <a href={`mailto:${l.email}`} onClick={(e) => e.stopPropagation()} className="text-link hover:underline">
            {l.email}
          </a>
        ) : null
      case 'cidade_uf':
        return cidadeUf(l)
      case 'interesse':
        return <InteresseBadge valor={l.interesse} />
      case 'acoes': {
        const wa = linkWhatsApp(l.telefone)
        const btn = cn(
          'grid place-items-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-fg',
          desktop ? 'size-7' : 'size-11',
        )
        return (
          <div
            className={cn(
              'flex items-center gap-0.5 transition-opacity duration-100',
              desktop && 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
            )}
          >
            <button type="button" title="Editar" aria-label="Editar" className={btn} onClick={(e) => (e.stopPropagation(), p.onEditar(l))}>
              <Pencil size={desktop ? 14 : 17} />
            </button>
            {wa ? (
              <a href={wa} target="_blank" rel="noreferrer" title="WhatsApp" aria-label="WhatsApp" className={cn(btn, 'hover:text-emerald-600')} onClick={(e) => e.stopPropagation()}>
                <MessageCircle size={desktop ? 14 : 17} />
              </a>
            ) : (
              <span className={cn(btn, 'pointer-events-none opacity-30')} aria-hidden>
                <MessageCircle size={desktop ? 14 : 17} />
              </span>
            )}
            <button type="button" title="Excluir" aria-label="Excluir" className={cn(btn, 'hover:text-red-600')} onClick={(e) => (e.stopPropagation(), p.onExcluir([l.id]))}>
              <Trash2 size={desktop ? 14 : 17} />
            </button>
          </div>
        )
      }
    }
    return null
  }

  const fixaNome = (id: string) => !desktop && id === 'nome'

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        role="grid"
        aria-rowcount={p.total}
        aria-label="Leads"
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="scroll-fino relative min-h-0 flex-1 overflow-auto outline-none"
      >
        <div style={{ width: larguraTotal, minWidth: '100%' }} className="relative flex min-h-full flex-col">
          {/* Cabeçalho */}
          <div role="row" className="sticky top-0 z-[8] flex bg-primary text-white" style={{ height: desktop ? 34 : 36 }}>
            {headers.map((h) => {
              const def = DEF[h.column.id]
              const filtro = def.filtro
              const ordenada = filtro && params.ordenacao.coluna === filtro
              const filtrada = filtro && p.filtroAtivo(filtro)
              return (
                <div
                  key={h.id}
                  role="columnheader"
                  aria-sort={ordenada ? (params.ordenacao.desc ? 'descending' : 'ascending') : undefined}
                  className={cn(
                    'group/h relative flex shrink-0 items-center gap-1 border-r border-white/15 px-2 text-[12.5px] font-medium select-none',
                    fixaNome(h.column.id) && 'sticky left-0 z-[2] bg-primary',
                  )}
                  style={{ width: h.getSize() }}
                >
                  {def.id === 'sel' ? (
                    <input
                      type="checkbox"
                      aria-label="Selecionar todos"
                      checked={todosSelecionados}
                      ref={(el) => {
                        if (el) el.indeterminate = !todosSelecionados && algunsSelecionados
                      }}
                      onChange={() => p.setSelecionados(todosSelecionados ? new Set() : new Set(linhas.map((l) => l.id)))}
                      className="size-3.5 accent-white"
                    />
                  ) : filtro ? (
                    <>
                      <button
                        type="button"
                        onClick={() => p.onOrdenar(filtro)}
                        className="flex min-w-0 flex-1 items-center gap-1 truncate text-left"
                        title={`Ordenar por ${def.label}`}
                      >
                        <span className="truncate">{def.label}</span>
                        {ordenada && (params.ordenacao.desc ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
                      </button>
                      <button
                        type="button"
                        aria-label={`Filtrar ${def.label}`}
                        aria-pressed={!!filtrada}
                        title={filtrada ? 'Filtro ativo' : 'Filtrar'}
                        onClick={(e) => {
                          const el = e.currentTarget
                          setFiltroAberto((f) => (f?.col === filtro ? null : { col: filtro, el }))
                        }}
                        className={cn(
                          'grid size-[22px] shrink-0 place-items-center rounded-[6px] transition-colors',
                          filtrada ? 'bg-white text-primary' : 'bg-white/14 hover:bg-white/25',
                        )}
                      >
                        <Funnel size={12} fill={filtrada ? 'currentColor' : 'none'} strokeWidth={2.2} />
                      </button>
                    </>
                  ) : (
                    <span className="truncate">{def.label}</span>
                  )}
                  {h.column.getCanResize() && (
                    <div
                      onMouseDown={h.getResizeHandler()}
                      onTouchStart={h.getResizeHandler()}
                      onDoubleClick={() => h.column.resetSize()}
                      className={cn(
                        'absolute top-0 -right-[3px] z-[3] h-full w-[6px] cursor-col-resize touch-none',
                        h.column.getIsResizing() ? 'bg-white/60' : 'hover:bg-white/40',
                      )}
                    />
                  )}
                </div>
              )
            })}
          </div>

          {/* Corpo virtualizado */}
          <div role="rowgroup" className="relative flex-1" style={{ height: virt.getTotalSize() }}>
            {itens.map((vi) => {
              const l = linhas[vi.index]
              const selecionada = p.selecionados.has(l.id)
              const fundo =
                selecionada || ativa?.linha === vi.index
                  ? 'bg-[color-mix(in_srgb,var(--primary)_8%,var(--surface))]'
                  : vi.index % 2 === 1
                    ? 'bg-zebra'
                    : 'bg-surface'
              return (
                <div
                  key={l.id}
                  role="row"
                  aria-rowindex={vi.index + 2}
                  aria-selected={selecionada}
                  className={cn('group absolute left-0 flex w-full text-[13px]', fundo, destaques.has(l.id) && 'linha-nova')}
                  style={{ height: altura, transform: `translateY(${vi.start}px)` }}
                >
                  {headers.map((h) => {
                    const col = h.column.id
                    const c = { linha: vi.index, col }
                    const ehAtiva = ativa?.linha === vi.index && ativa.col === col
                    const ehEditando = editando?.linha === vi.index && editando.col === col
                    return (
                      <div
                        key={col}
                        role="gridcell"
                        onClick={() => setAtiva(c)}
                        onDoubleClick={() => iniciarEdicao(c)}
                        className={cn(
                          'relative flex shrink-0 items-center overflow-hidden border-r border-b border-line px-2 whitespace-nowrap',
                          fixaNome(col) && cn('sticky left-0 z-[1] shadow-[1px_0_0_var(--line)]', fundo),
                          col === 'sel' && 'justify-center px-0',
                          ehAtiva && !ehEditando && 'outline-2 -outline-offset-2 outline-primary',
                        )}
                        style={{ width: h.getSize() }}
                      >
                        {ehEditando ? (
                          <CellEditor
                            lead={l}
                            coluna={DEF[col]}
                            onSalvar={(dados, mov) => salvarCelula(l, c, dados, mov)}
                            onCancelar={() => {
                              setEditando(null)
                              focarGrade()
                            }}
                            onErro={(m) => toast.error(m)}
                          />
                        ) : (
                          <div className="min-w-0 truncate">{conteudo(l, col)}</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
            {!p.carregando && linhas.length === 0 && (
              <div className="sticky left-0 flex h-40 w-[min(100%,100vw)] items-center justify-center text-[14px] text-muted">
                Nenhum lead encontrado.
              </div>
            )}
          </div>

          {(p.carregando || p.carregandoMais) && (
            <div className="sticky left-0 flex h-8 items-center justify-center gap-2 text-[12px] text-muted" style={{ width: 'min(100%, 100vw)' }}>
              <LoaderCircle size={14} className="animate-spin" /> Carregando…
            </div>
          )}

          {/* Linha de digitação direta */}
          {desktop && <InlineNewRow colunas={colunasLinha} />}
        </div>
      </div>

      {filtroAberto && (
        <ColumnFilterPopover
          key={filtroAberto.col}
          coluna={filtroAberto.col}
          ancora={filtroAberto.el}
          params={params}
          filtroAtual={params.filtros[filtroAberto.col]}
          formatar={COLUNAS.find((c) => c.filtro === filtroAberto.col)?.formatarValor}
          onAplicar={(v) => p.onFiltrar(filtroAberto.col, v)}
          onOrdenar={(desc) => p.onOrdenar(filtroAberto.col, desc)}
          onFechar={() => setFiltroAberto(null)}
        />
      )}
    </div>
  )
}
