import { useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { supabase, supabaseConfigurado } from '@/lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro('')
    setCarregando(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    setCarregando(false)
    if (error) setErro(error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos' : error.message)
  }

  const campo =
    'h-11 w-full rounded-[10px] border border-line bg-surface px-3 text-[15px] text-fg outline-none focus:border-primary focus:ring-3 focus:ring-primary/15'

  return (
    <div className="grid min-h-full place-items-center bg-bg px-4">
      <form onSubmit={entrar} className="w-full max-w-[360px]">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-primary text-[15px] font-bold text-white">SP</div>
          <div className="leading-tight">
            <div className="text-[18px] font-medium">SpeedPlan</div>
            <div className="text-[13px] font-light text-muted">Gestão interna</div>
          </div>
        </div>
        {!supabaseConfigurado ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-[14px] text-amber-900">
            Configure <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> no arquivo <code>.env</code> (veja{' '}
            <code>.env.example</code>) e reinicie o servidor.
          </div>
        ) : (
          <div className="space-y-3">
            <input type="email" required autoFocus autoComplete="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} className={campo} />
            <input type="password" required autoComplete="current-password" placeholder="Senha" value={senha} onChange={(e) => setSenha(e.target.value)} className={campo} />
            {erro && <p className="text-[13px] text-red-600">{erro}</p>}
            <button type="submit" disabled={carregando} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-primary text-[15px] font-medium text-white hover:bg-primary-hover disabled:opacity-60">
              {carregando && <LoaderCircle size={17} className="animate-spin" />} Entrar
            </button>
          </div>
        )}
      </form>
    </div>
  )
}
