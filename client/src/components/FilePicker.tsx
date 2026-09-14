import { useId, useRef, type ReactNode } from 'react'

interface Props {
  accept?: string
  onFile: (file: File) => void
  children: ReactNode
  className?: string
  title?: string
  disabled?: boolean
  /** No celular, abre a câmera diretamente ('user' = frontal, 'environment' = traseira). */
  capture?: 'user' | 'environment'
}

/** Botão de escolha de arquivo acessível por teclado (o input fica oculto visualmente, mas focável). */
export default function FilePicker({ accept, onFile, children, className = 'btn small', title, disabled, capture }: Props) {
  const ref = useRef<HTMLInputElement | null>(null)
  const id = useId()
  return (
    <>
      <button type="button" className={className} title={title} disabled={disabled} onClick={() => ref.current?.click()} aria-controls={id}>
        {children}
      </button>
      <input
        id={id}
        ref={ref}
        type="file"
        accept={accept}
        capture={capture}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
          e.target.value = ''
        }}
      />
    </>
  )
}
