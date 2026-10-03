import { AnimatePresence, motion } from 'framer-motion'
import { Sidebar } from './Sidebar'

/** Sidebar como drawer da esquerda (mobile), com overlay e arrastar para fechar. */
export function MobileDrawer({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  return (
    <AnimatePresence>
      {aberto && (
        <>
          <motion.div
            key="overlay"
            className="fixed inset-0 z-40 bg-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onFechar}
          />
          <motion.aside
            key="drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="fixed inset-y-0 left-0 z-50 w-[280px] max-w-[85vw] shadow-2xl"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'tween', duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={{ left: 0.7, right: 0 }}
            onDragEnd={(_, info) => {
              if (info.offset.x < -80 || info.velocity.x < -400) onFechar()
            }}
          >
            <Sidebar recolhida={false} variante="drawer" onNavegar={onFechar} />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
