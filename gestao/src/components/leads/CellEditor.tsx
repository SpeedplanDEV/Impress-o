import { useEffect, useRef, useState } from 'react'
import { INTERESSES, type Lead, type LeadUpdate } from '@/types/lead'
import { formatarCpfCnpj, formatarTelefone, somenteDigitos } from '@/lib/masks'
import { erroCampo } from '@/lib/validators'
import { CidadeCombobox, type CidadeValor } from './CidadeCombobox'
import type { ColunaDef } from './colunas'

export type Movimento = 'proxima' | 'anterior' | null

interface Props {
  lead: Lead
  coluna: ColunaDef
  /** devolve os dados alterados (ou null se nada mudou) e para onde mover */
  onSalvar: (dados: LeadUpdate | null, mov: Movimento) => void
  onCancelar: () => void
  onErro: (mensagem: string) => void
}

const inputCls =
  'absolute inset-0 h-full w-full border-2 border-primary bg-surface px-[6px] text-[13px] text-fg outline-none'

/** Editor inline de uma célula: Enter salva, Esc cancela, Tab/Shift+Tab salva e move. */
export function CellEditor({ lead, coluna, onSalvar, onCancelar, onErro }: Props) {
  const inicial = (() => {
    const v = coluna.campo ? ((lead[coluna.campo] as string | null) ?? '') : ''
    if (coluna.editor === 'doc') return formatarCpfCnpj(v)
    if (coluna.editor === 'tel') return formatarTelefone(v)
    return v
  })()
  const [valor, setValor] = useState(inicial)
  const [invalido, setInvalido] = useState(false)
  const ref = useRef<HTMLInputElement & HTMLSelectElement>(null)
  const concluido = useRef(false)

  useEffect(() => {
    ref.current?.focus()
    if (ref.current instanceof HTMLInputElement) ref.current.select()
  }, [])

  const dados = (): LeadUpdate | null => {
    if (!coluna.campo) return null
    let v: string | null = valor.trim()
    if (coluna.editor === 'doc' || coluna.editor === 'tel') v = somenteDigitos(v)
    if (coluna.editor === 'email') v = v.toLowerCase()
    if (coluna.campo !== 'nome' && coluna.campo !== 'interesse') v = v || null
    const atual = lead[coluna.campo] ?? null
    return v === atual ? null : ({ [coluna.campo]: v } as LeadUpdate)
  }

  const salvar = (mov: Movimento) => {
    if (concluido.current) return
    const erro = coluna.campo ? erroCampo(coluna.campo, valor) : null
    if (erro) {
      setInvalido(true)
      onErro(erro)
      return
    }
    concluido.current = true
    onSalvar(dados(), mov)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'Enter') {
      e.preventDefault()
      salvar(null)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      concluido.current = true
      onCancelar()
    } else if (e.key === 'Tab') {
      e.preventDefault()
      salvar(e.shiftKey ? 'anterior' : 'proxima')
    }
  }

  const onBlur = () => {
    if (concluido.current) return
    const erro = coluna.campo ? erroCampo(coluna.campo, valor) : null
    if (erro) {
      concluido.current = true
      onErro(`${erro} — alteração descartada`)
      onCancelar()
    } else salvar(null)
  }

  if (coluna.editor === 'cidade') {
    const salvarCidade = (v: CidadeValor) => {
      if (v.ibge_id == null || concluido.current) return
      concluido.current = true
      const mudou = v.ibge_id !== lead.ibge_id || v.cidade !== lead.cidade
      onSalvar(mudou ? { cidade: v.cidade, uf: v.uf, ibge_id: v.ibge_id } : null, null)
    }
    return (
      <div onKeyDown={(e) => e.stopPropagation()}>
        <CidadeCombobox
          ref={ref}
          autoFocus
          valor={{ cidade: lead.cidade, uf: lead.uf, ibge_id: lead.ibge_id }}
          onChange={salvarCidade}
          onKeyDownFechado={(e) => {
            if (e.key === 'Escape' || e.key === 'Enter') {
              e.preventDefault()
              concluido.current = true
              onCancelar()
            } else if (e.key === 'Tab') {
              e.preventDefault()
              concluido.current = true
              onSalvar(null, e.shiftKey ? 'anterior' : 'proxima')
            }
          }}
          onBlur={() =>
            setTimeout(() => {
              if (!concluido.current) {
                concluido.current = true
                onCancelar()
              }
            }, 150)
          }
          className={inputCls}
        />
      </div>
    )
  }

  if (coluna.editor === 'interesse') {
    return (
      <select
        ref={ref}
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        className={inputCls}
      >
        {INTERESSES.map((i) => (
          <option key={i} value={i}>
            {i}
          </option>
        ))}
      </select>
    )
  }

  return (
    <input
      ref={ref}
      value={valor}
      inputMode={coluna.editor === 'doc' || coluna.editor === 'tel' ? 'numeric' : coluna.editor === 'email' ? 'email' : 'text'}
      onChange={(e) => {
        setInvalido(false)
        const v = e.target.value
        setValor(coluna.editor === 'doc' ? formatarCpfCnpj(v) : coluna.editor === 'tel' ? formatarTelefone(v) : v)
      }}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      aria-invalid={invalido}
      className={`${inputCls} ${invalido ? '!border-red-500' : ''}`}
    />
  )
}
