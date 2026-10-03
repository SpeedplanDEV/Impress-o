import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { CornerDownLeft, LoaderCircle } from 'lucide-react'
import { INTERESSES, type Interesse } from '@/types/lead'
import { formatarCpfCnpj, formatarTelefone, somenteDigitos } from '@/lib/masks'
import { erroCampo } from '@/lib/validators'
import { mensagemErro } from '@/lib/erros'
import { cn } from '@/lib/cn'
import { useCriarLead } from '@/hooks/useLeads'
import { CidadeCombobox, type CidadeValor } from './CidadeCombobox'

interface Props {
  /** colunas visíveis, na ordem e largura da tabela */
  colunas: { id: string; largura: number }[]
}

interface Rascunho {
  nome: string
  empresa: string
  cpf_cnpj: string
  telefone: string
  email: string
  local: CidadeValor
  interesse: Interesse | ''
}

const novo = (): Rascunho => ({
  nome: '',
  empresa: '',
  cpf_cnpj: '',
  telefone: '',
  email: '',
  local: { cidade: null, uf: null, ibge_id: null },
  interesse: '',
})

const inputCls =
  'h-[26px] w-full min-w-0 rounded-[6px] border border-line bg-surface px-1.5 text-[13px] text-fg outline-none placeholder:text-muted/70 focus:border-primary focus:ring-2 focus:ring-primary/15'

/** Linha de digitação direta, fixa no rodapé da tabela. Tab avança, Enter salva, Esc limpa. */
export function InlineNewRow({ colunas }: Props) {
  const [r, setR] = useState<Rascunho>(novo)
  const [chave, setChave] = useState(0)
  const [erros, setErros] = useState<Partial<Record<keyof Rascunho, boolean>>>({})
  const nomeRef = useRef<HTMLInputElement>(null)
  const criar = useCriarLead()

  const set = <K extends keyof Rascunho>(k: K, v: Rascunho[K]) => {
    setR((a) => ({ ...a, [k]: v }))
    setErros((e) => ({ ...e, [k]: false }))
  }

  const limpar = () => {
    setR(novo())
    setErros({})
    setChave((k) => k + 1)
    setTimeout(() => nomeRef.current?.focus(), 0)
  }

  const salvar = async () => {
    const e: typeof erros = {}
    const msgs: string[] = []
    for (const campo of ['nome', 'cpf_cnpj', 'telefone', 'email'] as const) {
      const m = erroCampo(campo, r[campo])
      if (m) {
        e[campo] = true
        msgs.push(m)
      }
    }
    if (!r.interesse) {
      e.interesse = true
      msgs.push('Escolha o interesse')
    }
    if (msgs.length) {
      setErros(e)
      toast.error(msgs.join(' · '))
      return
    }
    try {
      const lead = await criar.mutateAsync({
        nome: r.nome.trim(),
        empresa: r.empresa.trim() || null,
        cpf_cnpj: somenteDigitos(r.cpf_cnpj) || null,
        telefone: somenteDigitos(r.telefone) || null,
        email: r.email.trim().toLowerCase() || null,
        cidade: r.local.cidade,
        uf: r.local.uf,
        ibge_id: r.local.ibge_id,
        interesse: r.interesse as Interesse,
      })
      toast.success(`Lead ${lead.codigo} criado`)
      limpar()
    } catch (err) {
      toast.error(mensagemErro(err))
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      salvar()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      limpar()
    }
  }

  const celula = (id: string) => {
    switch (id) {
      case 'codigo':
        return <span className="px-1 text-[12px] text-muted italic">auto</span>
      case 'nome':
        return (
          <input ref={nomeRef} aria-label="Nome" placeholder="Nome*" value={r.nome} onChange={(e) => set('nome', e.target.value)} className={cn(inputCls, erros.nome && 'border-red-400')} />
        )
      case 'empresa':
        return <input aria-label="Empresa" placeholder="Empresa" value={r.empresa} onChange={(e) => set('empresa', e.target.value)} className={inputCls} />
      case 'cpf_cnpj':
        return (
          <input aria-label="CPF/CNPJ" placeholder="CPF/CNPJ" inputMode="numeric" value={r.cpf_cnpj} onChange={(e) => set('cpf_cnpj', formatarCpfCnpj(e.target.value))} className={cn(inputCls, erros.cpf_cnpj && 'border-red-400')} />
        )
      case 'telefone':
        return (
          <input aria-label="Telefone" placeholder="Telefone" type="tel" inputMode="numeric" value={r.telefone} onChange={(e) => set('telefone', formatarTelefone(e.target.value))} className={cn(inputCls, erros.telefone && 'border-red-400')} />
        )
      case 'email':
        return (
          <input aria-label="E-mail" placeholder="E-mail" type="email" value={r.email} onChange={(e) => set('email', e.target.value)} className={cn(inputCls, erros.email && 'border-red-400')} />
        )
      case 'cidade_uf':
        return (
          <div className="flex w-full min-w-0 gap-1">
            <div className="min-w-0 flex-1">
              <CidadeCombobox key={chave} valor={r.local} onChange={(v) => set('local', v)} placeholder="Cidade" className={inputCls} />
            </div>
            <input aria-label="UF" readOnly tabIndex={-1} value={r.local.uf ?? ''} placeholder="UF" className={cn(inputCls, 'shrink-0 bg-surface-2 px-0 text-center')} style={{ width: 34 }} />
          </div>
        )
      case 'interesse':
        return (
          <select aria-label="Interesse" value={r.interesse} onChange={(e) => set('interesse', e.target.value as Interesse)} className={cn(inputCls, 'px-1', !r.interesse && 'text-muted', erros.interesse && 'border-red-400')}>
            <option value="">Interesse*</option>
            {INTERESSES.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        )
      case 'acoes':
        return (
          <button
            type="button"
            onClick={salvar}
            disabled={criar.isPending}
            className="inline-flex h-[26px] w-full items-center justify-center gap-1 rounded-[6px] bg-primary px-2 text-[12.5px] font-medium text-white hover:bg-primary-hover disabled:opacity-60"
          >
            {criar.isPending ? <LoaderCircle size={13} className="animate-spin" /> : <CornerDownLeft size={13} />}
            Salvar
          </button>
        )
      default:
        return null
    }
  }

  return (
    <div className="sticky bottom-0 z-[6] border-t-2 border-primary bg-surface" style={{ minWidth: '100%' }}>
      <div className="bg-primary/5">
        <div role="row" aria-label="Novo lead (digitação direta)" className="flex h-[34px] items-center" onKeyDown={onKeyDown}>
          {colunas.map((c) => (
            <div key={c.id} className="flex h-full shrink-0 items-center border-r border-line px-1" style={{ width: c.largura }}>
              {celula(c.id)}
            </div>
          ))}
        </div>
        <div className="sticky left-0 px-2 pb-1.5 text-[11.5px] text-muted">
          Digite direto na linha… <kbd className="font-sans">Tab</kbd> avança, <kbd className="font-sans">Enter</kbd> salva,{' '}
          <kbd className="font-sans">Esc</kbd> limpa — ou abra o cadastro completo em <span className="font-medium text-primary">Novo lead</span>
        </div>
      </div>
    </div>
  )
}
