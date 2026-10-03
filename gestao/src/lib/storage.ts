/** Acesso tolerante a falhas ao localStorage/sessionStorage (modo privado, bloqueio etc.). */
export function ler<T>(chave: string, padrao: T, area: 'local' | 'session' = 'local'): T {
  try {
    const s = (area === 'local' ? localStorage : sessionStorage).getItem(chave)
    return s == null ? padrao : (JSON.parse(s) as T)
  } catch {
    return padrao
  }
}

export function gravar(chave: string, valor: unknown, area: 'local' | 'session' = 'local') {
  try {
    ;(area === 'local' ? localStorage : sessionStorage).setItem(chave, JSON.stringify(valor))
  } catch {
    /* ignora */
  }
}
