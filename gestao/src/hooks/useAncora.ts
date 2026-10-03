import { useLayoutEffect, useState, type RefObject } from 'react'

export interface Posicao {
  left: number
  width: number
  top?: number
  bottom?: number
  maxHeight: number
}

/** Posição fixa (para portal) de um painel ancorado a um elemento; abre para cima se faltar espaço. */
export function useAncora(ref: RefObject<HTMLElement | null>, aberto: boolean, alturaDesejada = 320, largura?: number) {
  const [pos, setPos] = useState<Posicao | null>(null)
  useLayoutEffect(() => {
    if (!aberto) return
    const calcular = () => {
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const w = largura ?? r.width
      const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8))
      const abaixo = window.innerHeight - r.bottom - 8
      const acima = r.top - 8
      if (abaixo >= Math.min(alturaDesejada, 200) || abaixo >= acima) {
        setPos({ left, width: w, top: r.bottom + 4, maxHeight: Math.min(alturaDesejada, abaixo - 4) })
      } else {
        setPos({ left, width: w, bottom: window.innerHeight - r.top + 4, maxHeight: Math.min(alturaDesejada, acima - 4) })
      }
    }
    calcular()
    window.addEventListener('resize', calcular)
    window.addEventListener('scroll', calcular, true)
    return () => {
      window.removeEventListener('resize', calcular)
      window.removeEventListener('scroll', calcular, true)
    }
  }, [ref, aberto, alturaDesejada, largura])
  return pos
}
