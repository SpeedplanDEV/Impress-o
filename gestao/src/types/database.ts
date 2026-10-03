import type { Lead, LeadInsert, LeadUpdate } from './lead'

type FiltroArgs = { p_busca?: string | null; p_filtros?: Record<string, string[]>; p_desde?: string | null }

/** Tipos do banco (equivalente ao gerado por `supabase gen types`). */
export type Database = {
  public: {
    Tables: {
      leads: { Row: Lead; Insert: LeadInsert; Update: LeadUpdate; Relationships: [] }
    }
    Views: Record<string, never>
    Functions: {
      leads_filtrar: { Args: FiltroArgs; Returns: Lead[] }
      leads_valores_coluna: {
        Args: FiltroArgs & { p_coluna: string }
        Returns: { valor: string; total: number }[]
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
