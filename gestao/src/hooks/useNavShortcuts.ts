import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ROTAS } from '@/routes'

interface Opcoes {
  onPalette: () => void
  onToggleSidebar: () => void
}

/** Atalhos globais: Ctrl+K (command palette), Ctrl+B (recolher menu), Alt+1…9 (navegar). */
export function useNavShortcuts({ onPalette, onToggleSidebar }: Opcoes) {
  const navigate = useNavigate()
  const ref = useRef({ onPalette, onToggleSidebar })
  ref.current = { onPalette, onToggleSidebar }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      const tecla = e.key.toLowerCase()
      if (mod && !e.altKey && tecla === 'k') {
        e.preventDefault()
        ref.current.onPalette()
      } else if (mod && !e.altKey && tecla === 'b') {
        e.preventDefault()
        ref.current.onToggleSidebar()
      } else if (e.altKey && !mod && /^Digit[1-9]$/.test(e.code)) {
        const rota = ROTAS.find((r) => r.atalho === Number(e.code.slice(5)))
        if (rota) {
          e.preventDefault()
          navigate(rota.path)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])
}
