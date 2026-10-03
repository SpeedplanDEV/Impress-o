import { NavLink } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { ROTAS } from '@/routes'
import { cn } from '@/lib/cn'
import { QuickActionsFab } from './QuickActionsFab'
import { useShell } from './ShellContext'

const rota = (path: string) => ROTAS.find((r) => r.path === path)!

function Item({ path }: { path: string }) {
  const r = rota(path)
  return (
    <NavLink
      to={r.path}
      className={({ isActive }) =>
        cn(
          'relative flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] transition-transform duration-150',
          isActive ? '-translate-y-0.5 font-medium text-primary' : 'text-muted',
        )
      }
    >
      {({ isActive }) => (
        <>
          <r.icon size={22} strokeWidth={isActive ? 2.2 : 1.8} />
          <span>{r.label}</span>
          {isActive && <span className="absolute bottom-1 size-1 rounded-full bg-primary" />}
        </>
      )}
    </NavLink>
  )
}

export function BottomNav() {
  const { abrirDrawer } = useShell()
  return (
    <nav
      aria-label="Navegação inferior"
      className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur"
    >
      <div className="flex items-stretch">
        <Item path="/leads" />
        <Item path="/clientes" />
        <div className="flex flex-1 items-start justify-center">
          <QuickActionsFab />
        </div>
        <Item path="/financeiro" />
        <button
          type="button"
          onClick={abrirDrawer}
          className="flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] text-muted"
        >
          <Menu size={22} strokeWidth={1.8} />
          <span>Mais</span>
        </button>
      </div>
    </nav>
  )
}
