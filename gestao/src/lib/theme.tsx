import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type ModoTema = 'claro' | 'escuro' | 'night'
export type CorPrimaria = 'azul' | 'indigo' | 'verde' | 'laranja'

export const CORES: Record<CorPrimaria, { nome: string; base: string; hover: string }> = {
  azul: { nome: 'Azul', base: '#002AFF', hover: '#0022CC' },
  indigo: { nome: 'Índigo', base: '#4F46E5', hover: '#4338CA' },
  verde: { nome: 'Verde', base: '#047857', hover: '#065F46' },
  laranja: { nome: 'Laranja', base: '#C2410C', hover: '#9A3412' },
}

export const MODOS: { id: ModoTema; nome: string }[] = [
  { id: 'claro', nome: 'Claro' },
  { id: 'escuro', nome: 'Escuro' },
  { id: 'night', nome: 'Night' },
]

const ATTR: Record<ModoTema, string> = { claro: 'light', escuro: 'dark', night: 'night' }

interface TemaCtx {
  modo: ModoTema
  cor: CorPrimaria
  setModo: (m: ModoTema) => void
  setCor: (c: CorPrimaria) => void
  alternarModo: () => void
}

const Ctx = createContext<TemaCtx | null>(null)

function lerLocal<T extends string>(chave: string, padrao: T, validos: readonly string[]): T {
  try {
    const v = localStorage.getItem(chave)
    return v && validos.includes(v) ? (v as T) : padrao
  } catch {
    return padrao
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [modo, setModo] = useState<ModoTema>(() => lerLocal('sp:tema', 'claro', ['claro', 'escuro', 'night']))
  const [cor, setCor] = useState<CorPrimaria>(() => lerLocal('sp:cor', 'azul', Object.keys(CORES)))

  useEffect(() => {
    const el = document.documentElement
    el.dataset.theme = ATTR[modo]
    el.style.setProperty('--primary', CORES[cor].base)
    el.style.setProperty('--primary-hover', CORES[cor].hover)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', CORES[cor].base)
    try {
      localStorage.setItem('sp:tema', modo)
      localStorage.setItem('sp:cor', cor)
    } catch {
      /* ignora */
    }
  }, [modo, cor])

  const alternarModo = useCallback(
    () => setModo((m) => (m === 'claro' ? 'escuro' : m === 'escuro' ? 'night' : 'claro')),
    [],
  )

  const valor = useMemo(() => ({ modo, cor, setModo, setCor, alternarModo }), [modo, cor, alternarModo])
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function useTema() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useTema fora do ThemeProvider')
  return c
}
