import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { LoaderCircle, MapPin } from 'lucide-react'
import { useBuscaMunicipios, type Municipio } from '@/hooks/useIbgeMunicipios'
import { useDebounce } from '@/hooks/useDebounce'
import { useAncora } from '@/hooks/useAncora'
import { cn } from '@/lib/cn'

export interface CidadeValor {
  cidade: string | null
  uf: string | null
  ibge_id: number | null
}

interface Props {
  valor: CidadeValor
  onChange: (v: CidadeValor) => void
  className?: string
  placeholder?: string
  invalido?: boolean
  autoFocus?: boolean
  id?: string
  /** Teclas extras tratadas pelo pai quando a lista está fechada (Enter/Esc/Tab na linha de digitação) */
  onKeyDownFechado?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  onBlur?: () => void
}

/**
 * Combobox de município (IBGE): a cada tecla (debounce 200 ms, mín. 3 letras) mostra até 8 sugestões
 * "Cidade — UF". Ao selecionar, devolve nome, UF e código IBGE. Editar o texto desfaz a seleção.
 */
export const CidadeCombobox = forwardRef<HTMLInputElement, Props>(function CidadeCombobox(
  { valor, onChange, className, placeholder = 'Digite 3 letras…', invalido, autoFocus, id, onKeyDownFechado, onBlur },
  refExterno,
) {
  const [texto, setTexto] = useState(valor.cidade ?? '')
  const [aberto, setAberto] = useState(false)
  const [ativo, setAtivo] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  useImperativeHandle(refExterno, () => inputRef.current!)
  const listaId = useId()

  // sincroniza só quando o valor muda por fora (para limpar, o pai remonta via `key`)
  const emitido = useRef(valor.cidade)
  useEffect(() => {
    if (valor.cidade !== emitido.current) {
      emitido.current = valor.cidade
      setTexto(valor.cidade ?? '')
    }
  }, [valor.cidade])
  const emitir = (v: CidadeValor) => {
    emitido.current = v.cidade
    onChange(v)
  }

  const termo = useDebounce(texto, 200)
  const { resultados, carregando } = useBuscaMunicipios(termo, 8)
  const visivel = aberto && texto.trim().length >= 3 && (resultados.length > 0 || carregando)
  const pos = useAncora(inputRef, visivel, 300, Math.max(240, inputRef.current?.offsetWidth ?? 0))

  useEffect(() => setAtivo(0), [termo])

  const selecionar = (m: Municipio) => {
    setTexto(m.nome)
    setAberto(false)
    emitir({ cidade: m.nome, uf: m.uf, ibge_id: m.id })
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (visivel && resultados.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setAtivo((a) => (a + 1) % resultados.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setAtivo((a) => (a - 1 + resultados.length) % resultados.length)
        return
      }
      if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey && valor.ibge_id == null)) {
        e.preventDefault()
        e.stopPropagation()
        selecionar(resultados[ativo])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setAberto(false)
        return
      }
    }
    onKeyDownFechado?.(e)
  }

  return (
    <>
      <input
        ref={inputRef}
        id={id}
        role="combobox"
        aria-expanded={visivel}
        aria-controls={listaId}
        aria-autocomplete="list"
        aria-invalid={invalido}
        autoComplete="off"
        autoFocus={autoFocus}
        value={texto}
        placeholder={placeholder}
        onChange={(e) => {
          setTexto(e.target.value)
          setAberto(true)
          if (valor.ibge_id != null || valor.cidade) emitir({ cidade: null, uf: null, ibge_id: null })
        }}
        onFocus={() => texto.trim().length >= 3 && valor.ibge_id == null && setAberto(true)}
        onBlur={() => {
          setTimeout(() => setAberto(false), 120)
          onBlur?.()
        }}
        onKeyDown={onKeyDown}
        className={className}
      />
      {visivel &&
        pos &&
        createPortal(
          <ul
            id={listaId}
            role="listbox"
            className="scroll-fino fixed z-[80] overflow-y-auto rounded-xl bg-surface p-1 text-fg shadow-xl ring-1 ring-line"
            style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}
            onMouseDown={(e) => e.preventDefault()}
          >
            {carregando && resultados.length === 0 && (
              <li className="flex items-center gap-2 px-3 py-2 text-[13px] text-muted">
                <LoaderCircle size={14} className="animate-spin" /> Carregando municípios do IBGE…
              </li>
            )}
            {resultados.map((m, i) => (
              <li
                key={m.id}
                role="option"
                aria-selected={i === ativo}
                onMouseEnter={() => setAtivo(i)}
                onClick={() => selecionar(m)}
                className={cn(
                  'flex h-9 cursor-pointer items-center gap-2 rounded-lg px-3 text-[13.5px]',
                  i === ativo && 'bg-primary-soft text-primary',
                )}
              >
                <MapPin size={14} className="shrink-0 opacity-60" />
                <span className="truncate">{m.nome}</span>
                <span className="ml-auto shrink-0 pl-2 text-[12px] font-medium whitespace-nowrap opacity-70">— {m.uf}</span>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </>
  )
})
