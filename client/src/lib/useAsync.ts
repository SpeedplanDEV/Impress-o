import { useCallback, useEffect, useRef, useState } from 'react'
import { errorMessage } from './api'

/** Carrega dados assíncronos com estado de carregamento/erro e função de recarga. Respostas atrasadas de chamadas anteriores são ignoradas. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const generation = useRef(0)
  const reload = useCallback(async () => {
    const id = ++generation.current
    setLoading(true)
    setError(null)
    try {
      const result = await fn()
      if (id !== generation.current) return
      setData(result)
    } catch (err) {
      if (id !== generation.current) return
      setError(errorMessage(err))
    } finally {
      if (id === generation.current) setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(() => {
    void reload()
  }, [reload])
  return { data, loading, error, reload, setData }
}
