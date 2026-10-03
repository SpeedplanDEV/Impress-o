import { Check } from 'lucide-react'
import { INTERESSES, INTERESSE_CORES, type Interesse } from '@/types/lead'
import { cn } from '@/lib/cn'

interface Props {
  valor: Interesse | null | undefined
  onChange: (v: Interesse) => void
  grande?: boolean
  invalido?: boolean
}

/** Chips de seleção única, coloridos ao selecionar. */
export function InteresseChips({ valor, onChange, grande, invalido }: Props) {
  return (
    <div role="radiogroup" aria-label="Interesse" aria-invalid={invalido} className="flex flex-wrap gap-2">
      {INTERESSES.map((i) => {
        const ativo = valor === i
        const cor = INTERESSE_CORES[i]
        return (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={ativo}
            onClick={() => onChange(i)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                e.preventDefault()
                const idx = INTERESSES.indexOf(valor ?? INTERESSES[0])
                const prox = INTERESSES[(idx + (e.key === 'ArrowRight' ? 1 : INTERESSES.length - 1)) % INTERESSES.length]
                onChange(prox)
                ;(e.currentTarget.parentElement?.children[INTERESSES.indexOf(prox)] as HTMLElement)?.focus()
              }
            }}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3.5 font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
              grande ? 'h-11 text-[14px]' : 'h-9 text-[13px]',
              ativo ? 'border-transparent' : 'border-line text-fg hover:bg-surface-2',
              !ativo && invalido && 'border-red-300',
            )}
            style={ativo ? { background: cor.bg, color: cor.fg, boxShadow: `inset 0 0 0 1.5px ${cor.fg}33` } : undefined}
          >
            {ativo && <Check size={14} strokeWidth={2.5} />}
            {i}
          </button>
        )
      })}
    </div>
  )
}
