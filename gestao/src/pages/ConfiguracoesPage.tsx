import { Check, Moon, MoonStar, Sun } from 'lucide-react'
import { CORES, MODOS, useTema, type CorPrimaria, type ModoTema } from '@/lib/theme'
import { cn } from '@/lib/cn'

const ICONE_MODO: Record<ModoTema, typeof Sun> = { claro: Sun, escuro: Moon, night: MoonStar }

export default function ConfiguracoesPage() {
  const { cor, setCor, modo, setModo } = useTema()
  return (
    <div className="mx-auto max-w-[760px] px-4 py-6 lg:px-8 lg:py-10">
      <h1 className="text-[22px] font-medium">Configurações</h1>
      <p className="mt-1 text-[14px] text-muted">Preferências de aparência salvas neste navegador.</p>

      <section className="mt-8 border-t border-line pt-6">
        <h2 className="text-[15px] font-medium">Cor primária</h2>
        <p className="mt-0.5 text-[13px] text-muted">Usada no menu, cabeçalhos de tabela e botões principais.</p>
        <div role="radiogroup" aria-label="Cor primária" className="mt-4 flex flex-wrap gap-3">
          {(Object.keys(CORES) as CorPrimaria[]).map((c) => {
            const ativo = cor === c
            return (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={ativo}
                onClick={() => setCor(c)}
                className={cn(
                  'flex h-12 items-center gap-3 rounded-xl border pr-4 pl-2 text-[14px] transition-colors',
                  ativo ? 'border-transparent ring-2' : 'border-line hover:bg-surface-2',
                )}
                style={ativo ? ({ '--tw-ring-color': CORES[c].base } as React.CSSProperties) : undefined}
              >
                <span className="grid size-8 place-items-center rounded-lg text-white" style={{ background: CORES[c].base }}>
                  {ativo && <Check size={16} strokeWidth={2.6} />}
                </span>
                <span className="font-medium">{CORES[c].nome}</span>
                <span className="text-[12px] text-muted uppercase">{CORES[c].base}</span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="mt-8 border-t border-line pt-6">
        <h2 className="text-[15px] font-medium">Tema</h2>
        <div role="radiogroup" aria-label="Tema" className="mt-4 inline-flex rounded-xl border border-line p-1">
          {MODOS.map((m) => {
            const Icone = ICONE_MODO[m.id]
            const ativo = modo === m.id
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={ativo}
                onClick={() => setModo(m.id)}
                className={cn(
                  'inline-flex h-9 items-center gap-2 rounded-lg px-4 text-[14px] transition-colors',
                  ativo ? 'bg-primary font-medium text-white' : 'text-fg hover:bg-surface-2',
                )}
              >
                <Icone size={16} /> {m.nome}
              </button>
            )
          })}
        </div>
      </section>

      <section className="mt-8 border-t border-line pt-6 text-[13px] text-muted">
        <h2 className="mb-2 text-[15px] font-medium text-fg">Atalhos</h2>
        <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          <li><kbd className="rounded border border-line px-1.5">Ctrl K</kbd> Buscar / command palette</li>
          <li><kbd className="rounded border border-line px-1.5">Ctrl B</kbd> Recolher menu</li>
          <li><kbd className="rounded border border-line px-1.5">Alt 1…9</kbd> Ir para a tela</li>
          <li><kbd className="rounded border border-line px-1.5">Ctrl Enter</kbd> Salvar formulário</li>
        </ul>
      </section>
    </div>
  )
}
