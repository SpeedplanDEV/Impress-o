import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Download, FileSpreadsheet, FileText, FunnelX, LoaderCircle, Plus, Search, Trash2, X } from 'lucide-react'
import { useColumnFilters } from '@/hooks/useColumnFilters'
import { useDebounce } from '@/hooks/useDebounce'
import { useDesktop } from '@/hooks/useMediaQuery'
import { buscarTodosLeads, useExcluirLeads, useLeads, useLeadsRealtime, useValoresColuna } from '@/hooks/useLeads'
import { exportarCsv, exportarExcel } from '@/lib/exportar'
import { mensagemErro } from '@/lib/erros'
import { cn } from '@/lib/cn'
import { LeadsTable } from '@/components/leads/LeadsTable'
import { LABEL_COLUNA } from '@/components/leads/colunas'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useShell } from '@/components/shell/ShellContext'
import type { LeadsParams } from '@/types/lead'

const inicioDeHoje = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

export default function LeadsPage() {
  const desktop = useDesktop()
  const { abrirNovoLead, editarLead } = useShell()
  const f = useColumnFilters()
  const [busca, setBusca] = useState('')
  const buscaDeb = useDebounce(busca, 200)
  const [hoje, setHoje] = useState(false)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [excluir, setExcluir] = useState<string[] | null>(null)
  const [menuExportar, setMenuExportar] = useState(false)
  const [exportando, setExportando] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const params: LeadsParams = useMemo(
    () => ({ busca: buscaDeb, filtros: f.filtros, ordenacao: f.ordenacao, desde: hoje ? inicioDeHoje() : null }),
    [buscaDeb, f.filtros, f.ordenacao, hoje],
  )

  const q = useLeads(params)
  useLeadsRealtime()
  const excluirMut = useExcluirLeads()

  // UFs para os chips rápidos (mobile)
  const ufs = useValoresColuna('uf', { ...params, filtros: {}, desde: null }, !desktop)

  // limpa a seleção quando o conjunto filtrado muda
  useEffect(() => setSelecionados(new Set()), [params])

  useEffect(() => {
    if (!menuExportar) return
    const fora = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenuExportar(false)
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [menuExportar])

  const exportar = async (tipo: 'csv' | 'excel') => {
    setMenuExportar(false)
    setExportando(true)
    try {
      const todos = await buscarTodosLeads(params)
      if (tipo === 'csv') exportarCsv(todos)
      else exportarExcel(todos)
      toast.success(`${todos.length.toLocaleString('pt-BR')} leads exportados`)
    } catch (e) {
      toast.error(mensagemErro(e))
    } finally {
      setExportando(false)
    }
  }

  const confirmarExclusao = async () => {
    if (!excluir) return
    try {
      await excluirMut.mutateAsync(excluir)
      toast.success(excluir.length === 1 ? 'Lead excluído' : `${excluir.length} leads excluídos`)
      setSelecionados(new Set())
    } catch (e) {
      toast.error(mensagemErro(e))
    } finally {
      setExcluir(null)
    }
  }

  const ufAtiva = f.filtros.uf?.length === 1 ? f.filtros.uf[0] : null
  const chipCls = (ativo: boolean) =>
    cn(
      'h-8 shrink-0 rounded-full border px-3.5 text-[13px] font-medium transition-colors',
      ativo ? 'border-primary bg-primary text-white' : 'border-line bg-surface text-fg',
    )

  const ord = f.ordenacao
  const btnSec =
    'inline-flex h-9 items-center gap-2 rounded-[10px] border border-line bg-surface px-3 text-[13.5px] font-medium text-fg transition-colors hover:bg-surface-2 disabled:opacity-60'

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      {/* Barra superior fixa */}
      <div className="sticky top-0 z-20 bg-surface shadow-[0_1px_0_var(--line),0_2px_8px_rgb(15_23_42/0.04)]">
        <div className="flex items-center justify-end gap-2 px-3 py-2.5 lg:px-5">
          <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-[10px] border border-line bg-surface px-3 focus-within:border-primary focus-within:ring-3 focus-within:ring-primary/15 lg:max-w-[380px]">
            <Search size={16} className="shrink-0 text-muted" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, empresa, CPF/CNPJ…"
              aria-label="Buscar leads"
              className="min-w-0 flex-1 bg-transparent text-[14px] text-fg outline-none placeholder:text-muted"
            />
            {busca && (
              <button type="button" onClick={() => setBusca('')} aria-label="Limpar busca" className="text-muted hover:text-fg">
                <X size={15} />
              </button>
            )}
          </label>

          {selecionados.size > 0 && (
            <button type="button" onClick={() => setExcluir([...selecionados])} className={cn(btnSec, 'text-red-600 hover:bg-red-50')}>
              <Trash2 size={15} /> <span className="hidden sm:inline">Excluir</span> ({selecionados.size})
            </button>
          )}

          <div ref={menuRef} className="relative">
            <button
              type="button"
              disabled={exportando}
              onClick={() => setMenuExportar((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuExportar}
              className={btnSec}
            >
              {exportando ? <LoaderCircle size={15} className="animate-spin" /> : <Download size={15} />}
              <span className="hidden sm:inline">Exportar</span>
            </button>
            {menuExportar && (
              <div role="menu" className="absolute right-0 z-30 mt-1 w-48 rounded-xl bg-surface p-1 text-[13.5px] shadow-xl ring-1 ring-line">
                <button role="menuitem" type="button" onClick={() => exportar('csv')} className="flex h-9 w-full items-center gap-2 rounded-lg px-3 hover:bg-surface-2">
                  <FileText size={15} className="text-muted" /> CSV
                </button>
                <button role="menuitem" type="button" onClick={() => exportar('excel')} className="flex h-9 w-full items-center gap-2 rounded-lg px-3 hover:bg-surface-2">
                  <FileSpreadsheet size={15} className="text-emerald-600" /> Excel
                </button>
              </div>
            )}
          </div>

          {desktop && (
            <button
              type="button"
              onClick={abrirNovoLead}
              className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-primary px-4 text-[13.5px] font-medium text-white shadow-[0_4px_14px_color-mix(in_srgb,var(--primary)_35%,transparent)] transition-colors hover:bg-primary-hover"
            >
              <Plus size={17} strokeWidth={2.2} /> Novo lead
            </button>
          )}
        </div>

        {/* Chips de filtro rápido (mobile) */}
        {!desktop && (
          <div className="sem-scrollbar flex gap-2 overflow-x-auto px-3 pb-2.5">
            <button
              type="button"
              className={chipCls(!ufAtiva && !hoje)}
              onClick={() => {
                f.setFiltro('uf', null)
                setHoje(false)
              }}
            >
              Todos
            </button>
            <button type="button" className={chipCls(hoje)} onClick={() => setHoje((v) => !v)}>
              Hoje
            </button>
            {(ufs.data ?? [])
              .filter((u) => u.valor)
              .map((u) => (
                <button
                  key={u.valor}
                  type="button"
                  className={chipCls(ufAtiva === u.valor)}
                  onClick={() => f.setFiltro('uf', ufAtiva === u.valor ? null : [u.valor])}
                >
                  {u.valor}
                </button>
              ))}
          </div>
        )}
      </div>

      {/* Linha de contexto */}
      <div className="flex flex-wrap items-center gap-x-1.5 px-3 py-1.5 text-[12px] text-muted lg:px-5">
        <span className="font-medium text-fg tabular-nums">{q.total.toLocaleString('pt-BR')} leads</span>
        <span>·</span>
        <span>
          Ordenado por {LABEL_COLUNA[ord.coluna]} {ord.desc ? '↓' : '↑'}
        </span>
        {desktop && (
          <>
            <span>·</span>
            <span>Filtro e ordenação pelo funil de cada coluna</span>
            <span>·</span>
            <span>duplo clique na célula para editar</span>
          </>
        )}
        {f.quantidadeAtivos > 0 && (
          <>
            <span>·</span>
            <button type="button" onClick={f.limparTodos} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
              <FunnelX size={13} /> Limpar filtros ({f.quantidadeAtivos})
            </button>
          </>
        )}
      </div>

      {q.isError ? (
        <div className="m-5 rounded-xl border border-red-200 bg-red-50 p-4 text-[14px] text-red-700">
          Não foi possível carregar os leads: {mensagemErro(q.error)}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col border-t border-line">
          <LeadsTable
            linhas={q.linhas}
            total={q.total}
            params={params}
            desktop={desktop}
            carregando={q.isLoading}
            carregandoMais={q.isFetchingNextPage}
            temMais={!!q.hasNextPage}
            carregarMais={q.fetchNextPage}
            selecionados={selecionados}
            setSelecionados={setSelecionados}
            filtroAtivo={f.ativo}
            onFiltrar={f.setFiltro}
            onOrdenar={(coluna, desc) => (desc == null ? f.alternarOrdenacao(coluna) : f.setOrdenacao({ coluna, desc }))}
            onEditar={editarLead}
            onExcluir={setExcluir}
          />
        </div>
      )}

      <ConfirmDialog
        aberto={!!excluir}
        titulo={excluir?.length === 1 ? 'Excluir lead?' : `Excluir ${excluir?.length ?? 0} leads?`}
        mensagem="Esta ação não pode ser desfeita."
        confirmar="Excluir"
        perigo
        carregando={excluirMut.isPending}
        onConfirmar={confirmarExclusao}
        onCancelar={() => setExcluir(null)}
      />
    </div>
  )
}
