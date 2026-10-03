import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigurado = Boolean(url && chave)

/** Cliente do projeto Supabase próprio (configure .env com VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). */
export const supabase: SupabaseClient<Database> = createClient<Database>(
  url || 'http://localhost:54321',
  chave || 'chave-ausente',
  { auth: { persistSession: true, autoRefreshToken: true } },
)
