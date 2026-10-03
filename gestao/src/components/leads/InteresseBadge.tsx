import { INTERESSE_CORES, type Interesse } from '@/types/lead'

export function InteresseBadge({ valor }: { valor: Interesse | string }) {
  const cor = INTERESSE_CORES[valor as Interesse]
  if (!cor) return <span className="text-muted">{valor}</span>
  return (
    <span
      className="inline-flex h-5 items-center rounded-full px-2 text-[11.5px] leading-none font-medium"
      style={{ background: cor.bg, color: cor.fg }}
    >
      {valor}
    </span>
  )
}
