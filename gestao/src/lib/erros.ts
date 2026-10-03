/** Mensagem amigável para erros do Supabase/PostgREST. */
export function mensagemErro(e: unknown): string {
  const err = e as { message?: string; code?: string; details?: string } | null
  if (!err) return 'Erro desconhecido'
  if (err.code === '23505') return 'Registro duplicado'
  if (err.code === '23514') return 'Valor fora do formato permitido'
  if (err.code === '42501' || err.code === 'PGRST301') return 'Sem permissão — faça login novamente'
  if (err.code === 'PGRST202' || err.code === '42883') return 'Banco desatualizado: rode a migration de leads'
  if (err.message?.includes('Failed to fetch')) return 'Sem conexão com o servidor'
  return err.message || 'Erro ao salvar'
}
