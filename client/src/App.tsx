import { useCallback, useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { authApi, errorMessage, type AuthStatus } from './lib/api'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import SetupPage from './pages/SetupPage'
import HomePage from './pages/HomePage'
import PersonsPage from './pages/PersonsPage'
import CompaniesPage from './pages/CompaniesPage'
import TemplatesPage from './pages/TemplatesPage'
import TemplateEditorPage from './pages/TemplateEditorPage'
import PrintPage from './pages/PrintPage'
import CostPage from './pages/CostPage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  const [status, setStatus] = useState<AuthStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setStatus(await authApi.status())
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    }
  }, [])

  useEffect(() => {
    void refresh()
    const onUnauthorized = () => setStatus((s) => (s ? { ...s, authenticated: false } : s))
    window.addEventListener('impresso:unauthorized', onUnauthorized)
    return () => window.removeEventListener('impresso:unauthorized', onUnauthorized)
  }, [refresh])

  if (error) {
    return (
      <div className="auth-screen">
        <div className="card auth-card">
          <h1 className="brand">Impress-o</h1>
          <div className="alert error">{error}</div>
          <p className="muted">Verifique se o servidor está em execução (npm start) e recarregue a página.</p>
          <button className="btn" onClick={() => void refresh()}>Tentar novamente</button>
        </div>
      </div>
    )
  }
  if (!status) return <div className="auth-screen"><div className="muted">Carregando…</div></div>
  if (!status.setupDone) {
    return <SetupPage onSuccess={(userName) => setStatus({ setupDone: true, authenticated: true, userName })} />
  }
  if (!status.authenticated) {
    return <LoginPage userName={status.userName} onSuccess={(userName) => setStatus({ setupDone: true, authenticated: true, userName })} />
  }

  async function logout() {
    try {
      await authApi.logout()
    } finally {
      setStatus((s) => (s ? { ...s, authenticated: false } : s))
    }
  }

  return (
    <Routes>
      <Route element={<Layout userName={status.userName} onLogout={() => void logout()} />}>
        <Route index element={<HomePage />} />
        <Route path="/pessoas" element={<PersonsPage />} />
        <Route path="/empresas" element={<CompaniesPage />} />
        <Route path="/modelos" element={<TemplatesPage />} />
        <Route path="/modelos/:id" element={<TemplateEditorPage />} />
        <Route path="/impressao" element={<PrintPage />} />
        <Route path="/custo" element={<CostPage />} />
        <Route path="/configuracoes" element={<SettingsPage onAccountChanged={(userName) => setStatus((s) => (s ? { ...s, userName } : s))} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
