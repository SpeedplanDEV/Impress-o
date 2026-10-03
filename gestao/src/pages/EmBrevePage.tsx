import { useLocation } from 'react-router-dom'
import { rotaPorPath } from '@/routes'

export default function EmBrevePage() {
  const rota = rotaPorPath(useLocation().pathname)
  const Icone = rota?.icon
  return (
    <div className="grid h-full place-items-center px-6 text-center">
      <div>
        {Icone && <Icone size={40} strokeWidth={1.4} className="mx-auto text-primary" />}
        <h1 className="mt-3 text-[20px] font-medium">{rota?.label ?? 'Página'}</h1>
        <p className="mt-1 text-[14px] text-muted">Módulo em implantação.</p>
      </div>
    </div>
  )
}
