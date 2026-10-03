import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Plus, UserPlus, Users, Wallet, X } from 'lucide-react'
import { useShell } from './ShellContext'

/** Botão central "+" da bottom nav. Em /leads abre direto o formulário; nas demais telas, ações rápidas. */
export function QuickActionsFab() {
  const [aberto, setAberto] = useState(false)
  const { abrirNovoLead } = useShell()
  const { pathname } = useLocation()
  const navigate = useNavigate()

  const acoes = [
    { label: 'Novo lead', icon: UserPlus, fn: abrirNovoLead },
    { label: 'Novo cliente', icon: Users, fn: () => navigate('/clientes') },
    { label: 'Novo lançamento', icon: Wallet, fn: () => navigate('/financeiro') },
  ]

  const clicar = () => {
    if (pathname.startsWith('/leads')) abrirNovoLead()
    else setAberto(true)
  }

  return (
    <>
      <button
        type="button"
        onClick={clicar}
        aria-label="Ações rápidas"
        className="-mt-6 grid size-14 place-items-center rounded-full bg-primary text-white shadow-[0_8px_20px_color-mix(in_srgb,var(--primary)_45%,transparent)] ring-4 ring-surface transition-transform active:scale-95"
      >
        <Plus size={26} strokeWidth={2.2} />
      </button>
      <AnimatePresence>
        {aberto && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setAberto(false)}
            />
            <motion.div
              role="dialog"
              aria-label="Ações rápidas"
              className="pb-safe fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-surface text-fg shadow-2xl"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'tween', duration: 0.22 }}
            >
              <div className="flex items-center justify-between px-5 pt-4 pb-2">
                <span className="text-[15px] font-medium">Ações rápidas</span>
                <button
                  type="button"
                  onClick={() => setAberto(false)}
                  aria-label="Fechar"
                  className="grid size-10 place-items-center rounded-full text-muted"
                >
                  <X size={20} />
                </button>
              </div>
              <ul className="px-3 pb-4">
                {acoes.map((a) => (
                  <li key={a.label}>
                    <button
                      type="button"
                      onClick={() => {
                        setAberto(false)
                        a.fn()
                      }}
                      className="flex h-14 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] active:bg-surface-2"
                    >
                      <span className="grid size-9 place-items-center rounded-lg bg-primary-soft text-primary">
                        <a.icon size={19} />
                      </span>
                      {a.label}
                    </button>
                  </li>
                ))}
              </ul>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
