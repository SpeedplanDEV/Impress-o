import { NavLink } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import type { Rota } from '@/routes'
import { cn } from '@/lib/cn'

interface Props {
  rota: Rota
  recolhida: boolean
  /** layoutId da barra ativa (único por instância de sidebar) */
  grupo: string
  onNavegar?: () => void
}

export function SidebarItem({ rota, recolhida, grupo, onNavegar }: Props) {
  const Icone = rota.icon
  return (
    <NavLink
      to={rota.path}
      onClick={onNavegar}
      aria-label={recolhida ? rota.label : undefined}
      className={({ isActive }) =>
        cn(
          'group relative flex h-10 items-center rounded-[10px] text-[14px] font-medium outline-none transition-colors duration-150',
          'focus-visible:ring-2 focus-visible:ring-white/70',
          recolhida ? 'justify-center px-0' : 'gap-3 px-3',
          isActive
            ? 'bg-white text-primary shadow-[0_2px_10px_rgb(0_0_0/0.18)]'
            : 'text-white/90 hover:bg-white/12 hover:text-white',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId={grupo}
              className="absolute top-2 bottom-2 -left-3 w-[3px] rounded-r-full bg-white"
              transition={{ type: 'spring', stiffness: 500, damping: 38 }}
            />
          )}
          <Icone
            size={20}
            strokeWidth={isActive ? 2.2 : 1.8}
            className="shrink-0 transition-transform duration-150 group-hover:translate-x-0.5"
          />
          <AnimatePresence initial={false}>
            {!recolhida && (
              <motion.span
                key="label"
                className="truncate"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { duration: 0.14, delay: 0.08 } }}
                exit={{ opacity: 0, transition: { duration: 0.06 } }}
              >
                {rota.label}
              </motion.span>
            )}
          </AnimatePresence>
          {recolhida && (
            <span
              role="tooltip"
              className="pointer-events-none absolute left-full z-50 ml-3 rounded-md bg-slate-900 px-2 py-1 text-xs font-medium whitespace-nowrap text-white opacity-0 shadow-lg transition-opacity duration-100 group-hover:opacity-100 group-focus-visible:opacity-100"
            >
              {rota.label} <span className="text-white/50">Alt+{rota.atalho}</span>
            </span>
          )}
        </>
      )}
    </NavLink>
  )
}
