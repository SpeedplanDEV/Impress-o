import { useSyncExternalStore } from 'react'

/** Ids de linhas recém-criadas, destacadas por 1,5 s. */
let ids = new Set<string>()
const ouvintes = new Set<() => void>()
const emitir = () => ouvintes.forEach((f) => f())

export function destacar(id: string) {
  if (ids.has(id)) return
  ids = new Set(ids).add(id)
  emitir()
  setTimeout(() => {
    ids = new Set(ids)
    ids.delete(id)
    emitir()
  }, 1500)
}

export function useDestaques() {
  return useSyncExternalStore(
    (f) => (ouvintes.add(f), () => ouvintes.delete(f)),
    () => ids,
  )
}
