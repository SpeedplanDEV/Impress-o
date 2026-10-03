import { useCallback, useState } from 'react'
import { gravar, ler } from '@/lib/storage'

const CHAVE = 'sp:sidebar-recolhida'

/** Sidebar recolhida/expandida, persistida no localStorage. */
export function useSidebarState() {
  const [recolhida, setRecolhidaState] = useState<boolean>(() => ler(CHAVE, false))
  const setRecolhida = useCallback((v: boolean) => {
    setRecolhidaState(v)
    gravar(CHAVE, v)
  }, [])
  const alternar = useCallback(() => {
    setRecolhidaState((v) => {
      gravar(CHAVE, !v)
      return !v
    })
  }, [])
  return { recolhida, setRecolhida, alternar }
}
