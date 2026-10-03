import { Menu, Search } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { rotaPorPath, SECAO_LABEL } from '@/routes'
import { useShell } from './ShellContext'

export function MobileHeader() {
  const { abrirDrawer, abrirPalette } = useShell()
  const rota = rotaPorPath(useLocation().pathname)
  return (
    <header
      className="fixed inset-x-0 top-0 z-30 bg-primary text-white shadow-[0_1px_8px_rgb(0_0_0/0.15)]"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="flex h-14 items-center gap-1 px-2">
        <button
          type="button"
          onClick={abrirDrawer}
          aria-label="Abrir menu"
          className="grid size-11 place-items-center rounded-xl active:bg-white/15"
        >
          <Menu size={22} />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-[16px] font-medium">
          {rota ? (
            <>
              <span className="font-light text-white/70">{SECAO_LABEL[rota.secao]} / </span>
              {rota.label}
            </>
          ) : (
            'SpeedPlan'
          )}
        </h1>
        <button
          type="button"
          onClick={abrirPalette}
          aria-label="Buscar"
          className="grid size-11 place-items-center rounded-xl active:bg-white/15"
        >
          <Search size={21} />
        </button>
      </div>
    </header>
  )
}
