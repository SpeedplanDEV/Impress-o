import { useState, type FormEvent } from 'react'
import { authApi } from '../lib/api'

interface Props {
  userName: string | null
  onSuccess: (userName: string) => void
}

export default function LoginPage({ userName, onSuccess }: Props) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const r = await authApi.login(password)
      onSuccess(r.userName)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao entrar.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-screen">
      <form className="card auth-card" onSubmit={submit}>
        <h1 className="brand">Impress-o</h1>
        <p className="muted">Sistema de impressão de cartões e crachás</p>
        <p>Olá{userName ? `, ${userName}` : ''}. Informe sua senha para continuar.</p>
        <label>
          Senha
          <input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <div className="alert error">{error}</div>}
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
