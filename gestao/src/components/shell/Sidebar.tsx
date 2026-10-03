import { motion } from 'framer-motion'
import { LogOut, Moon, MoonStar, PanelLeftClose, PanelLeftOpen, Search, Sun } from 'lucide-react'
import { ROTAS, SECOES, SECAO_LABEL } from '@/routes'
import { useTema } from '@/lib/theme'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { SidebarItem } from './SidebarItem'
import { useShell } from './ShellContext'

interface Props {
  recolhida: boolean
  variante: 'desktop' | 'drawer'
  onNavegar?: () => void
}

export function Sidebar({ recolhida, variante, onNavegar }: Props) {
  const { abrirPalette, alternarSidebar, sessao } = useShell()
  const { modo, alternarModo } = useTema()
  const usuario = sessao?.user
  const nome = (usuario?.user_metadata?.nome as string) || usuario?.email?.split('@')[0] || 'Usuário'
  const cargo = (usuario?.user_metadata?.cargo as string) || 'Equipe SpeedPlan'
  const iniciais = nome
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
  const IconeTema = modo === 'claro' ? Sun : modo === 'escuro' ? Moon : MoonStar

  return (
    <div
      className="flex h-full flex-col border-r border-white/14 text-white"
      style={{ background: 'linear-gradient(180deg, var(--primary-dark) 0%, var(--primary) 100%)' }}
    >
      {/* Topo: logo + toggle */}
      <div className={cn('flex h-16 shrink-0 items-center', recolhida ? 'justify-center px-0' : 'gap-3 px-4')}>
        <button
          type="button"
          onClick={variante === 'desktop' && recolhida ? alternarSidebar : undefined}
          className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-white text-[13px] font-bold tracking-tight text-primary shadow-sm"
          aria-label={recolhida ? 'Expandir menu' : 'SpeedPlan'}
          tabIndex={recolhida ? 0 : -1}
        >
          SP
        </button>
        {!recolhida && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { delay: 0.08, duration: 0.14 } }}
            className="min-w-0 flex-1 leading-tight"
          >
            <div className="truncate text-[15px] font-medium">SpeedPlan</div>
            <div className="truncate text-[12px] font-light text-white/70">Gestão interna</div>
          </motion.div>
        )}
        {variante === 'desktop' && !recolhida && (
          <button
            type="button"
            onClick={alternarSidebar}
            title="Recolher menu (Ctrl+B)"
            aria-label="Recolher menu"
            className="grid size-8 place-items-center rounded-lg text-white/80 hover:bg-white/12 hover:text-white"
          >
            <PanelLeftClose size={18} />
          </button>
        )}
      </div>

      {/* Busca */}
      <div className={cn('shrink-0 pb-2', recolhida ? 'px-3' : 'px-3')}>
        <button
          type="button"
          onClick={abrirPalette}
          title="Buscar (Ctrl+K)"
          className={cn(
            'flex h-9 w-full items-center rounded-[10px] bg-white/10 text-[13px] text-white/75 ring-1 ring-white/14 transition-colors hover:bg-white/16',
            recolhida ? 'justify-center' : 'gap-2 px-3',
          )}
        >
          <Search size={16} className="shrink-0" />
          {!recolhida && (
            <>
              <span className="flex-1 text-left">Buscar…</span>
              <kbd className="rounded bg-white/14 px-1.5 py-0.5 font-sans text-[11px] text-white/80">Ctrl K</kbd>
            </>
          )}
        </button>
      </div>

      {/* Navegação */}
      <nav
        className={cn('flex-1 px-3 pb-3', recolhida ? 'overflow-visible' : 'scroll-fino overflow-y-auto')}
        aria-label="Navegação principal"
      >
        {SECOES.map((secao) => (
          <div key={secao} className="mt-3 first:mt-1">
            {recolhida ? (
              <div className="mx-auto my-2 h-px w-6 bg-white/20" />
            ) : (
              <div className="px-3 pb-1.5 text-[10.5px] font-medium tracking-[0.08em] text-white/55">{secao}</div>
            )}
            <div className="flex flex-col gap-0.5" aria-label={SECAO_LABEL[secao]}>
              {ROTAS.filter((r) => r.secao === secao).map((r) => (
                <SidebarItem
                  key={r.path}
                  rota={r}
                  recolhida={recolhida}
                  grupo={`sidebar-ativo-${variante}`}
                  onNavegar={onNavegar}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Rodapé */}
      <div
        className={cn(
          'flex shrink-0 items-center border-t border-white/14 py-3',
          recolhida ? 'flex-col gap-2 px-2' : 'gap-2.5 px-3',
        )}
      >
        <div className="grid size-9 shrink-0 place-items-center rounded-full bg-white/18 text-[13px] font-medium ring-1 ring-white/25">
          {iniciais}
        </div>
        {!recolhida && (
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[13px] font-medium">{nome}</div>
            <div className="truncate text-[11.5px] font-light text-white/65">{cargo}</div>
          </div>
        )}
        <button
          type="button"
          onClick={alternarModo}
          title={`Tema: ${modo} (alternar)`}
          aria-label="Alternar tema"
          className="grid size-8 place-items-center rounded-lg text-white/85 hover:bg-white/12 hover:text-white"
        >
          <IconeTema size={17} />
        </button>
        {!recolhida && (
          <button
            type="button"
            onClick={() => supabase.auth.signOut()}
            title="Sair"
            aria-label="Sair"
            className="grid size-8 place-items-center rounded-lg text-white/70 hover:bg-white/12 hover:text-white"
          >
            <LogOut size={16} />
          </button>
        )}
      </div>
      {variante === 'desktop' && recolhida && (
        <button
          type="button"
          onClick={alternarSidebar}
          title="Expandir menu (Ctrl+B)"
          aria-label="Expandir menu"
          className="mx-auto mb-3 grid size-8 place-items-center rounded-lg text-white/70 hover:bg-white/12 hover:text-white"
        >
          <PanelLeftOpen size={18} />
        </button>
      )}
    </div>
  )
}
