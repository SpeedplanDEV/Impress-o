import { useId, useRef, type ReactNode } from 'react'

interface Props {
  accept?: string
  onFile: (file: File) => void
  children: ReactNode
  className?: string
  title?: string
  disabled?: boolean
}

/** Botão de escolha de arquivo acessível por teclado (o input fica oculto visualmente, mas focável). */
export default function FilePicker({ accept, onFile, children, className = 'btn small', title, disabled }: Props) {
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
