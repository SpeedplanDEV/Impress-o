import { useCallback, useMemo, useState } from 'react'
import { useLocation, useOutlet } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import type { Session } from '@supabase/supabase-js'
import { useDesktop } from '@/hooks/useMediaQuery'
import { useSidebarState } from '@/hooks/useSidebarState'
import { useNavShortcuts } from '@/hooks/useNavShortcuts'
import type { Lead } from '@/types/lead'
import { LeadModal } from '@/components/leads/LeadModal'
import { ShellContext, type ShellCtx } from './ShellContext'
import { Sidebar } from './Sidebar'
import { MobileDrawer } from './MobileDrawer'
import { MobileHeader } from './MobileHeader'
import { BottomNav } from './BottomNav'
import { CommandPalette } from './CommandPalette'

/** Mantém o conteúdo da rota que está saindo durante a animação. */
function OutletCongelado() {
  const outlet = useOutlet()
  const [congelado] = useState(outlet)
  return congelado
}

export function AppShell({ sessao }: { sessao: Session | null }) {
  const desktop = useDesktop()
  const { recolhida, alternar } = useSidebarState()
  const [palette, setPalette] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const [modal, setModal] = useState<{ aberto: boolean; lead: Lead | null }>({ aberto: false, lead: null })
  const location = useLocation()

  const abrirPalette = useCallback(() => setPalette(true), [])
  const alternarSidebar = useCallback(() => alternar(), [alternar])
  useNavShortcuts({ onPalette: () => setPalette((v) => !v), onToggleSidebar: alternarSidebar })

  const ctx: ShellCtx = useMemo(
    () => ({
      abrirNovoLead: () => setModal({ aberto: true, lead: null }),
      editarLead: (lead) => setModal({ aberto: true, lead }),
      abrirPalette,
      abrirDrawer: () => setDrawer(true),
      alternarSidebar,
      sidebarRecolhida: recolhida,
      sessao,
    }),
    [abrirPalette, alternarSidebar, recolhida, sessao],
  )

  const largura = recolhida ? 64 : 240

  return (
    <ShellContext.Provider value={ctx}>
      <div className="h-full bg-bg text-fg">
        {desktop ? (
          <motion.aside
            className="fixed inset-y-0 left-0 z-30"
            initial={false}
            animate={{ width: largura }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <Sidebar recolhida={recolhida} variante="desktop" />
          </motion.aside>
        ) : (
          <>
            <MobileHeader />
            <MobileDrawer aberto={drawer} onFechar={() => setDrawer(false)} />
            <BottomNav />
          </>
        )}

        <main
          className="h-full transition-[padding] duration-[220ms] ease-out"
          style={
            desktop
              ? { paddingLeft: largura }
              : {
                  paddingTop: 'calc(56px + env(safe-area-inset-top))',
                  paddingBottom: 'calc(56px + env(safe-area-inset-bottom))',
                }
          }
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              className="h-full overflow-y-auto"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
            >
              <OutletCongelado />
            </motion.div>
          </AnimatePresence>
        </main>

        <CommandPalette aberto={palette} onFechar={() => setPalette(false)} />
        <LeadModal aberto={modal.aberto} lead={modal.lead} onFechar={() => setModal((m) => ({ ...m, aberto: false }))} />
      </div>
    </ShellContext.Provider>
  )
}
