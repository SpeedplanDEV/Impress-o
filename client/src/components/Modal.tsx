import type { ReactNode } from 'react'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
  footer?: ReactNode
}

export default function Modal({ title, onClose, children, wide, footer }: Props) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="row between" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button className="btn ghost small" onClick={onClose} aria-label="Fechar">✕</button>
        </div>
        {children}
        {footer && <div className="row end" style={{ marginTop: 16 }}>{footer}</div>}
      </div>
    </div>
  )
}
