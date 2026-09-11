import { useState, type FormEvent } from 'react'
import { authApi } from '../lib/api'

interface Props {
  onSuccess: (userName: string) => void
}

export default function SetupPage({ onSuccess }: Props) {
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError('As senhas não conferem.')
      return
    }
    setBusy(true)
    try {
      const r = await authApi.setup(name, password)
      onSuccess(r.userName)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na configuração.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-screen">
      <form className="card auth-card" onSubmit={submit}>
        <h1 className="brand">Impress-o</h1>
        <p className="muted">Configuração inicial</p>
        <p>
          Este sistema possui <strong>um único usuário</strong>. Defina seu nome e uma senha de acesso.
        </p>
        <label>
          Seu nome
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
        </label>
        <label>
          Senha (mínimo 6 caracteres)
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        </label>
        <label>
          Confirmar senha
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={6} />
        </label>
        {error && <div className="alert error">{error}</div>}
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? 'Salvando…' : 'Concluir configuração'}
        </button>
      </form>
    </div>
  )
}
