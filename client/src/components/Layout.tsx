import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'

interface Props {
  userName: string | null
  onLogout: () => void
}

const NAV = [
  { to: '/', label: 'Início', end: true, icon: '⌂' },
  { to: '/pessoas', label: 'Pessoas', icon: '👤' },
  { to: '/empresas', label: 'Empresas e departamentos', icon: '🏢' },
  { to: '/modelos', label: 'Modelos de cartão', icon: '🪪' },
  { to: '/impressao', label: 'Impressão', icon: '🖨' },
  { to: '/custo', label: 'Custo de impressão', icon: '💰' },
  { to: '/configuracoes', label: 'Configurações', icon: '⚙' },
]

export default function Layout({ userName, onLogout }: Props) {
  const [open, setOpen] = useState(false)
  const location = useLocation()

  // Fecha a gaveta ao navegar (celular)
  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open])

  const current = NAV.find((n) => (n.end ? location.pathname === n.to : location.pathname.startsWith(n.to)))

  return (
    <div className="shell">
      <header className="topbar">
        <button className="btn ghost topbar-menu" onClick={() => setOpen(true)} aria-label="Abrir menu" aria-expanded={open}>☰</button>
        <span className="brand topbar-brand">Impress-o</span>
        <span className="topbar-title">{current?.label ?? ''}</span>
      </header>
      {open && <div className="drawer-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />}
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Menu principal">
        <div className="row between">
          <div>
            <div className="brand">Impress-o</div>
            <div className="muted small">Cartões e crachás · Entrust Sigma DS</div>
          </div>
          <button className="btn ghost sidebar-close" onClick={() => setOpen(false)} aria-label="Fechar menu">✕</button>
        </div>
        <nav>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'active' : '')}>
              <span className="nav-icon" aria-hidden="true">{n.icon}</span> {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="small">Usuário: <strong>{userName ?? '—'}</strong></div>
          <button className="btn ghost small" onClick={onLogout}>Sair</button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
