import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { CircleCheck, LoaderCircle, X } from 'lucide-react'
import { INTERESSES, type Lead, type LeadInsert } from '@/types/lead'
import { formatarCpfCnpj, formatarTelefone, somenteDigitos } from '@/lib/masks'
import { emailValido, telefoneValido, tipoDocumento } from '@/lib/validators'
import { mensagemErro } from '@/lib/erros'
import { cn } from '@/lib/cn'
import { useAtualizarLead, useCriarLead } from '@/hooks/useLeads'
import { CidadeCombobox } from './CidadeCombobox'
import { InteresseChips } from './InteresseChips'

const schema = z.object({
  nome: z.string().trim().min(1, 'Informe o nome'),
  empresa: z.string().trim(),
  cpf_cnpj: z.string().refine((v) => tipoDocumento(v) !== null, 'CPF/CNPJ inválido'),
  telefone: z.string().refine((v) => !somenteDigitos(v) || telefoneValido(v), 'Telefone incompleto'),
  email: z.string().trim().refine((v) => !v || emailValido(v), 'E-mail inválido'),
  local: z
    .object({ cidade: z.string().nullable(), uf: z.string().nullable(), ibge_id: z.number().nullable() })
    .refine((v) => !!v.cidade && v.ibge_id != null, 'Selecione a cidade na lista'),
  interesse: z.enum(INTERESSES, { required_error: 'Escolha o interesse', invalid_type_error: 'Escolha o interesse' }),
})
type FormValores = z.infer<typeof schema>

const vazio = (): Partial<FormValores> => ({
  nome: '',
  empresa: '',
  cpf_cnpj: '',
  telefone: '',
  email: '',
  local: { cidade: null, uf: null, ibge_id: null },
  interesse: undefined,
})

const deLead = (l: Lead): Partial<FormValores> => ({
  nome: l.nome,
  empresa: l.empresa ?? '',
  cpf_cnpj: formatarCpfCnpj(l.cpf_cnpj),
  telefone: formatarTelefone(l.telefone),
  email: l.email ?? '',
  local: { cidade: l.cidade, uf: l.uf, ibge_id: l.ibge_id },
  interesse: l.interesse,
})

const paraBanco = (v: FormValores): LeadInsert => ({
  nome: v.nome.trim(),
  empresa: v.empresa.trim() || null,
  cpf_cnpj: somenteDigitos(v.cpf_cnpj) || null,
  telefone: somenteDigitos(v.telefone) || null,
  email: v.email.trim().toLowerCase() || null,
  cidade: v.local.cidade,
  uf: v.local.uf,
  ibge_id: v.local.ibge_id,
  interesse: v.interesse,
})

interface Props {
  aberto: boolean
  /** lead em edição; null = novo */
  lead: Lead | null
  onFechar: () => void
}

const campoCls = (erro?: boolean) =>
  cn(
    'h-[46px] w-full rounded-[10px] border bg-surface px-3 text-[15px] text-fg outline-none transition-colors lg:h-10 lg:text-[14px]',
    'placeholder:text-muted/70 focus:border-primary focus:ring-3 focus:ring-primary/15',
    erro ? 'border-red-400' : 'border-line',
  )

function Campo({ label, erro, children, extra, obrigatorio, htmlFor }: {
  label: string
  erro?: string
  extra?: React.ReactNode
  obrigatorio?: boolean
  htmlFor?: string
  children: React.ReactNode
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="mb-1.5 block text-[12.5px] font-medium text-muted">
        {label}
        {obrigatorio && <span className="text-red-500">*</span>}
      </label>
      {children}
      <div className="mt-1 min-h-4 text-[12px]">
        {erro ? <span className="text-red-600">{erro}</span> : extra}
      </div>
    </div>
  )
}

export function LeadModal({ aberto, lead, onFechar }: Props) {
  return createPortal(
    <AnimatePresence>
      {aberto && <Conteudo key={lead?.id ?? 'novo'} lead={lead} onFechar={onFechar} />}
    </AnimatePresence>,
    document.body,
  )
}

function Conteudo({ lead, onFechar }: { lead: Lead | null; onFechar: () => void }) {
  const editando = lead != null
  const criar = useCriarLead()
  const atualizar = useAtualizarLead()
  const [chaveForm, setChaveForm] = useState(0)
  const nomeRef = useRef<HTMLInputElement | null>(null)

  const form = useForm<FormValores>({
    resolver: zodResolver(schema),
    defaultValues: lead ? deLead(lead) : vazio(),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  })
  const { register, handleSubmit, control, formState, reset, watch } = form
  const erros = formState.errors
  const doc = watch('cpf_cnpj')
  const tipoDoc = tipoDocumento(doc ?? '')
  const salvando = criar.isPending || atualizar.isPending

  useEffect(() => {
    const t = setTimeout(() => nomeRef.current?.focus(), 60)
    return () => clearTimeout(t)
  }, [chaveForm])

  const salvar = (continuar: boolean) =>
    handleSubmit(async (v) => {
      try {
        if (editando) {
          await atualizar.mutateAsync({ id: lead.id, dados: paraBanco(v) })
          toast.success(`Lead ${lead.codigo} atualizado`)
          onFechar()
        } else {
          const novo = await criar.mutateAsync(paraBanco(v))
          toast.success(`Lead ${novo.codigo} criado`)
          if (continuar) {
            reset(vazio())
            setChaveForm((k) => k + 1)
          } else onFechar()
        }
      } catch (e) {
        toast.error(mensagemErro(e))
      }
    })()

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onFechar()
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      salvar(false)
    }
  }

  const { ref: nomeRegRef, ...nomeReg } = register('nome')

  return (
    <motion.div
      className="fixed inset-0 z-[65] flex items-stretch justify-center bg-overlay lg:items-center lg:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
      onMouseDown={(e) => e.target === e.currentTarget && onFechar()}
    >
      <motion.form
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-lead"
        noValidate
        onKeyDown={onKeyDown}
        onSubmit={(e) => {
          e.preventDefault()
          salvar(false)
        }}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24 }}
        transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
        className="flex h-full w-full flex-col overflow-hidden bg-surface text-fg shadow-2xl lg:h-auto lg:max-h-[92vh] lg:max-w-[1040px] lg:rounded-2xl"
      >
        {/* Cabeçalho */}
        <div
          className="flex shrink-0 items-center gap-3 bg-primary px-5 text-white"
          style={{ paddingTop: 'max(env(safe-area-inset-top), 0px)' }}
        >
          <div className="flex h-16 min-w-0 flex-1 items-baseline gap-3">
            <h2 id="titulo-lead" className="self-center text-[17px] font-medium">
              {editando ? 'Editar lead' : 'Novo lead'}
            </h2>
            <span className="self-center truncate text-[13px] font-light text-white/75">
              Código: {editando ? lead.codigo : 'automático'}
            </span>
          </div>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="grid size-10 place-items-center rounded-full hover:bg-white/15"
          >
            <X size={20} />
          </button>
        </div>

        {/* Campos */}
        <div className="scroll-fino flex-1 overflow-y-auto px-5 pt-5 pb-2">
          <div key={chaveForm} className="grid grid-cols-1 gap-x-5 gap-y-1 lg:grid-cols-3">
            <Campo label="Nome" obrigatorio erro={erros.nome?.message} htmlFor="lead-nome">
              <input
                id="lead-nome"
                {...nomeReg}
                ref={(el) => {
                  nomeRegRef(el)
                  nomeRef.current = el
                }}
                autoComplete="off"
                placeholder="Nome do contato"
                className={campoCls(!!erros.nome)}
              />
            </Campo>
            <Campo label="Empresa" htmlFor="lead-empresa">
              <input id="lead-empresa" {...register('empresa')} autoComplete="off" placeholder="Empresa" className={campoCls()} />
            </Campo>
            <Controller
              control={control}
              name="cpf_cnpj"
              render={({ field }) => (
                <Campo
                  label="CPF/CNPJ"
                  htmlFor="lead-doc"
                  erro={erros.cpf_cnpj?.message}
                  extra={
                    tipoDoc && (
                      <span className="inline-flex items-center gap-1 text-emerald-600">
                        <CircleCheck size={13} /> {tipoDoc === 'cpf' ? 'CPF válido' : 'CNPJ válido'}
                      </span>
                    )
                  }
                >
                  <input
                    id="lead-doc"
                    {...field}
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="000.000.000-00"
                    onChange={(e) => field.onChange(formatarCpfCnpj(e.target.value))}
                    className={campoCls(!!erros.cpf_cnpj)}
                  />
                </Campo>
              )}
            />
            <Controller
              control={control}
              name="telefone"
              render={({ field }) => (
                <Campo label="Telefone" htmlFor="lead-tel" erro={erros.telefone?.message}>
                  <input
                    id="lead-tel"
                    {...field}
                    type="tel"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="(00) 00000-0000"
                    onChange={(e) => field.onChange(formatarTelefone(e.target.value))}
                    className={campoCls(!!erros.telefone)}
                  />
                </Campo>
              )}
            />
            <Campo label="E-mail" htmlFor="lead-email" erro={erros.email?.message}>
              <input
                id="lead-email"
                {...register('email')}
                type="email"
                inputMode="email"
                autoComplete="off"
                placeholder="nome@empresa.com.br"
                className={campoCls(!!erros.email)}
              />
            </Campo>
            <Controller
              control={control}
              name="local"
              render={({ field }) => (
                <Campo label="Cidade" obrigatorio htmlFor="lead-cidade" erro={erros.local?.message}>
                  <div className="flex gap-2">
                    <div className="min-w-0 flex-1">
                      <CidadeCombobox
                        id="lead-cidade"
                        valor={field.value ?? { cidade: null, uf: null, ibge_id: null }}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        invalido={!!erros.local}
                        className={campoCls(!!erros.local)}
                      />
                    </div>
                    <input
                      aria-label="UF"
                      readOnly
                      tabIndex={-1}
                      value={field.value?.uf ?? ''}
                      placeholder="UF"
                      className={cn(campoCls(), 'shrink-0 bg-surface-2 text-center font-medium')}
                      style={{ width: 64 }}
                    />
                  </div>
                </Campo>
              )}
            />
            <div className="lg:col-span-3">
              <Controller
                control={control}
                name="interesse"
                render={({ field }) => (
                  <Campo label="Interesse" obrigatorio erro={erros.interesse?.message}>
                    <InteresseChips valor={field.value} onChange={field.onChange} grande invalido={!!erros.interesse} />
                  </Campo>
                )}
              />
            </div>
          </div>
        </div>

        {/* Rodapé */}
        <div className="pb-safe flex shrink-0 flex-wrap items-center gap-2 border-t border-line bg-surface-2/60 px-5 py-3">
          <button
            type="button"
            onClick={onFechar}
            className="h-11 rounded-[10px] px-4 text-[14px] text-fg hover:bg-surface-2 lg:h-10"
          >
            Cancelar <span className="hidden text-muted lg:inline">(Esc)</span>
          </button>
          <span className="flex-1" />
          {!editando && (
            <button
              type="button"
              disabled={salvando}
              onClick={() => salvar(true)}
              className="h-11 rounded-[10px] border border-line px-4 text-[14px] font-medium hover:bg-surface-2 disabled:opacity-60 lg:h-10"
            >
              Salvar e novo
            </button>
          )}
          <button
            type="submit"
            disabled={salvando}
            className="inline-flex h-11 items-center gap-2 rounded-[10px] bg-primary px-5 text-[14px] font-medium text-white shadow-[0_4px_14px_color-mix(in_srgb,var(--primary)_35%,transparent)] hover:bg-primary-hover disabled:opacity-60 lg:h-10"
          >
            {salvando && <LoaderCircle size={16} className="animate-spin" />}
            Salvar <span className="hidden text-white/70 lg:inline">Ctrl+Enter</span>
          </button>
        </div>
      </motion.form>
    </motion.div>
  )
}
