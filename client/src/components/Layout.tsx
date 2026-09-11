import { NavLink, Outlet } from 'react-router-dom'

interface Props {
  userName: string | null
  onLogout: () => void
}

const NAV = [
  { to: '/', label: 'Início', end: true },
  { to: '/pessoas', label: 'Pessoas' },
  { to: '/empresas', label: 'Empresas e departamentos' },
  { to: '/modelos', label: 'Modelos de cartão' },
  { to: '/impressao', label: 'Impressão' },
  { to: '/custo', label: 'Custo de impressão' },
  { to: '/configuracoes', label: 'Configurações' },
]

export default function Layout({ userName, onLogout }: Props) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">Impress-o</div>
        <div className="muted small">Cartões e crachás · Entrust Sigma DS</div>
        <nav>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'active' : '')}>
              {n.label}
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
