/** Remove tudo que não é dígito. */
export const somenteDigitos = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '')

/** Máscara progressiva: até 11 dígitos → CPF 000.000.000-00; 12–14 → CNPJ 00.000.000/0000-00. */
export function formatarCpfCnpj(v: string | null | undefined): string {
  const d = somenteDigitos(v).slice(0, 14)
  if (d.length <= 11) {
    return d
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2')
  }
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

/** Máscara progressiva de telefone: (00) 0000-0000 ou (00) 00000-0000. */
export function formatarTelefone(v: string | null | undefined): string {
  const d = somenteDigitos(v).slice(0, 11)
  if (d.length === 0) return ''
  if (d.length <= 2) return `(${d}`
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

/** Link do WhatsApp (assume Brasil quando vier só DDD + número). */
export function linkWhatsApp(telefone: string | null | undefined): string | null {
  const d = somenteDigitos(telefone)
  if (d.length < 10) return null
  return `https://wa.me/${d.length <= 11 ? '55' + d : d}`
}

/** Remove acentos e baixa a caixa (para busca). */
export const normalizar = (v: string) =>
  v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
