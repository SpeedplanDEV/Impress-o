import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Command } from 'cmdk'
import { AnimatePresence, motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { Contrast, LoaderCircle, PanelLeft, Search, Target, UserPlus, Users } from 'lucide-react'
import { ROTAS } from '@/routes'
import { useTema } from '@/lib/theme'
import { normalizar } from '@/lib/masks'
import { useDebounce } from '@/hooks/useDebounce'
import { buscarClientesRapido, buscarLeadsRapido } from '@/hooks/useLeads'
import { useShell } from './ShellContext'

interface Props {
  aberto: boolean
  onFechar: () => void
}

const itemCls =
  'flex h-10 cursor-pointer items-center gap-3 rounded-lg px-3 text-[14px] text-fg data-[selected=true]:bg-primary-soft data-[selected=true]:text-primary'
const grupoCls =
  '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted'

export function CommandPalette({ aberto, onFechar }: Props) {
  const [busca, setBusca] = useState('')
  const termo = useDebounce(busca.trim(), 250)
  const navigate = useNavigate()
  const { abrirNovoLead, alternarSidebar, editarLead } = useShell()
  const { alternarModo } = useTema()

  useEffect(() => {
    if (!aberto) setBusca('')
  }, [aberto])

  const leads = useQuery({
    queryKey: ['palette', 'leads', termo],
    queryFn: () => buscarLeadsRapido(termo),
    enabled: aberto && termo.length >= 2,
  })
  const clientes = useQuery({
    queryKey: ['palette', 'clientes', termo],
    queryFn: () => buscarClientesRapido(termo),
    enabled: aberto && termo.length >= 2,
  })

  const executar = (fn: () => void) => {
    onFechar()
    fn()
  }

  const t = normalizar(busca)
  const paginas = useMemo(() => ROTAS.filter((r) => !t || normalizar(r.label).includes(t)), [t])
  const acoes = useMemo(
    () =>
      [
        { id: 'novo-lead', label: 'Novo lead', icon: UserPlus, atalho: '', fn: abrirNovoLead },
        { id: 'tema', label: 'Alternar tema', icon: Contrast, atalho: '', fn: alternarModo },
        { id: 'menu', label: 'Recolher menu', icon: PanelLeft, atalho: 'Ctrl B', fn: alternarSidebar },
      ].filter((a) => !t || normalizar(a.label).includes(t)),
    [t, abrirNovoLead, alternarModo, alternarSidebar],
  )

  const carregando = (leads.isFetching || clientes.isFetching) && termo.length >= 2

  return (
    <AnimatePresence>
      {aberto && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-start justify-center bg-overlay px-3 pt-[12vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onMouseDown={(e) => e.target === e.currentTarget && onFechar()}
        >
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="w-full max-w-[620px] overflow-hidden rounded-2xl bg-surface shadow-2xl ring-1 ring-line"
          >
            <Command
              label="Command palette"
              shouldFilter={false}
              loop
              onKeyDown={(e) => e.key === 'Escape' && onFechar()}
            >
              <div className="flex items-center gap-2 border-b border-line px-4">
                <Search size={18} className="text-muted" />
                <Command.Input
                  autoFocus
                  value={busca}
                  onValueChange={setBusca}
                  placeholder="Buscar páginas, ações, leads, clientes…"
                  className="h-13 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-muted"
                />
                {carregando && <LoaderCircle size={16} className="animate-spin text-muted" />}
                <kbd className="rounded border border-line px-1.5 text-[11px] text-muted">Esc</kbd>
              </div>
              <Command.List className="scroll-fino max-h-[60vh] overflow-y-auto p-2">
                <Command.Empty className="px-3 py-8 text-center text-[14px] text-muted">
                  Nada encontrado.
                </Command.Empty>
                {paginas.length > 0 && (
                  <Command.Group heading="PÁGINAS" className={grupoCls}>
                    {paginas.map((r) => (
                      <Command.Item
                        key={r.path}
                        value={`pagina-${r.path}`}
                        onSelect={() => executar(() => navigate(r.path))}
                        className={itemCls}
                      >
                        <r.icon size={17} className="text-muted" />
                        <span className="flex-1">{r.label}</span>
                        <span className="text-[11px] text-muted">Alt {r.atalho}</span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}
                {acoes.length > 0 && (
                  <Command.Group heading="AÇÕES" className={grupoCls}>
                    {acoes.map((a) => (
                      <Command.Item key={a.id} value={`acao-${a.id}`} onSelect={() => executar(a.fn)} className={itemCls}>
                        <a.icon size={17} className="text-muted" />
                        <span className="flex-1">{a.label}</span>
                        {a.atalho && <span className="text-[11px] text-muted">{a.atalho}</span>}
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}
                {(leads.data?.length ?? 0) > 0 && (
                  <Command.Group heading="LEADS" className={grupoCls}>
                    {leads.data!.map((l) => (
                      <Command.Item
                        key={l.id}
                        value={`lead-${l.id}`}
                        onSelect={() =>
                          executar(() => {
                            navigate('/leads')
                            editarLead(l)
                          })
                        }
                        className={itemCls}
                      >
                        <Target size={17} className="text-muted" />
                        <span className="flex-1 truncate">
                          {l.nome}
                          {l.empresa && <span className="text-muted"> · {l.empresa}</span>}
                        </span>
                        <span className="text-[11px] text-muted">{l.codigo}</span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}
                {(clientes.data?.length ?? 0) > 0 && (
                  <Command.Group heading="CLIENTES" className={grupoCls}>
                    {clientes.data!.map((c) => (
                      <Command.Item
                        key={c.id}
                        value={`cliente-${c.id}`}
                        onSelect={() => executar(() => navigate('/clientes'))}
                        className={itemCls}
                      >
                        <Users size={17} className="text-muted" />
                        <span className="flex-1 truncate">{c.nome}</span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}
              </Command.List>
            </Command>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
