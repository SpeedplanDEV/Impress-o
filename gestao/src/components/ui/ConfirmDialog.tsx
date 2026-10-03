import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { LoaderCircle } from 'lucide-react'

interface Props {
  aberto: boolean
  titulo: string
  mensagem: React.ReactNode
  confirmar?: string
  perigo?: boolean
  carregando?: boolean
  onConfirmar: () => void
  onCancelar: () => void
}

export function ConfirmDialog({ aberto, titulo, mensagem, confirmar = 'Confirmar', perigo, carregando, onConfirmar, onCancelar }: Props) {
  return createPortal(
    <AnimatePresence>
      {aberto && (
        <motion.div
          className="fixed inset-0 z-[75] flex items-end justify-center bg-overlay p-0 sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onMouseDown={(e) => e.target === e.currentTarget && onCancelar()}
          onKeyDown={(e) => e.key === 'Escape' && onCancelar()}
        >
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-titulo"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.18 }}
            className="pb-safe w-full max-w-[420px] rounded-t-2xl bg-surface p-5 text-fg shadow-2xl sm:rounded-2xl"
          >
            <h2 id="confirm-titulo" className="text-[16px] font-medium">
              {titulo}
            </h2>
            <div className="mt-2 text-[14px] text-muted">{mensagem}</div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={onCancelar} className="h-10 rounded-[10px] px-4 text-[14px] hover:bg-surface-2">
                Cancelar
              </button>
              <button
                type="button"
                autoFocus
                disabled={carregando}
                onClick={onConfirmar}
                className={`inline-flex h-10 items-center gap-2 rounded-[10px] px-4 text-[14px] font-medium text-white disabled:opacity-60 ${perigo ? 'bg-red-600 hover:bg-red-700' : 'bg-primary hover:bg-primary-hover'}`}
              >
                {carregando && <LoaderCircle size={15} className="animate-spin" />}
                {confirmar}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
