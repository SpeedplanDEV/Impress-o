import { somenteDigitos } from './masks'

export function cpfValido(valor: string): boolean {
  const d = somenteDigitos(valor)
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  const dv = (n: number) => {
    let soma = 0
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i)
    const r = (soma * 10) % 11
    return r === 10 ? 0 : r
  }
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10])
}

export function cnpjValido(valor: string): boolean {
  const d = somenteDigitos(valor)
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false
  const dv = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const soma = pesos.reduce((s, p, i) => s + Number(d[i]) * p, 0)
    const r = soma % 11
    return r < 2 ? 0 : 11 - r
  }
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13])
}

/** 'cpf' | 'cnpj' se válido, null se inválido; '' para vazio. */
export function tipoDocumento(valor: string): 'cpf' | 'cnpj' | null | '' {
  const d = somenteDigitos(valor)
  if (!d) return ''
  if (d.length === 11) return cpfValido(d) ? 'cpf' : null
  if (d.length === 14) return cnpjValido(d) ? 'cnpj' : null
  return null
}

export const emailValido = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim())

export const telefoneValido = (v: string) => {
  const n = somenteDigitos(v).length
  return n === 10 || n === 11
}

/** Mensagem de erro de um campo do lead (null = válido). Usada na edição inline e na linha de digitação. */
export function erroCampo(campo: string, valor: string): string | null {
  const v = valor.trim()
  switch (campo) {
    case 'nome':
      return v ? null : 'Informe o nome'
    case 'cpf_cnpj':
      return !v || tipoDocumento(v) ? null : 'CPF/CNPJ inválido'
    case 'telefone':
      return !v || telefoneValido(v) ? null : 'Telefone inválido'
    case 'email':
      return !v || emailValido(v) ? null : 'E-mail inválido'
    default:
      return null
  }
}
