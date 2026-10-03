import { useSyncExternalStore } from 'react'

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (f) => {
      const m = window.matchMedia(query)
      m.addEventListener('change', f)
      return () => m.removeEventListener('change', f)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

/** Desktop = ≥ 1024px */
export const useDesktop = () => useMediaQuery('(min-width: 1024px)')
