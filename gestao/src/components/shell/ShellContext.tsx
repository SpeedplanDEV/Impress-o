import { createContext, useContext } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Lead } from '@/types/lead'

export interface ShellCtx {
  abrirNovoLead: () => void
  editarLead: (lead: Lead) => void
  abrirPalette: () => void
  abrirDrawer: () => void
  alternarSidebar: () => void
  sidebarRecolhida: boolean
  sessao: Session | null
}

export const ShellContext = createContext<ShellCtx | null>(null)

export function useShell() {
  const c = useContext(ShellContext)
  if (!c) throw new Error('useShell fora do AppShell')
  return c
}
