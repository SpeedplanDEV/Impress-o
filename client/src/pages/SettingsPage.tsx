import { useEffect, useState, type FormEvent } from 'react'
import QRCode from 'qrcode'
import { api, authApi, printersApi, settingsApi } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import Modal from '../components/Modal'
import PrinterForm from '../components/PrinterForm'
import type { Printer, PrinterStatus } from '../lib/types'

export default function SettingsPage({ onAccountChanged }: { onAccountChanged: (name: string) => void }) {
  const info = useAsync(() => settingsApi.get())
  const printers = useAsync(() => printersApi.list())
  const [editing, setEditing] = useState<Partial<Printer> | null>(null)
  const [statuses, setStatuses] = useState<Record<number, PrinterStatus | 'loading'>>({})
  const [error, setError] = useState<string | null>(null)
  const [testMsg, setTestMsg] = useState<string | null>(null)

  async function printTest(p: Printer) {
    setTestMsg(`Enviando cartão de teste para "${p.name}"…`)
    try {
      const r = await api.post<{ result: { message: string } }>('/api/print/calibration', { printerId: p.id, orientation: 'landscape' })
      setTestMsg(r.result.message)
    } catch (err) {
      setTestMsg(err instanceof Error ? err.message : String(err))
    }
  }

  async function checkStatus(p: Printer) {
    setStatuses((s) => ({ ...s, [p.id]: 'loading' }))
    try {
      const st = await printersApi.status(p.id)
      setStatuses((s) => ({ ...s, [p.id]: st }))
    } catch (err) {
      setStatuses((s) => ({ ...s, [p.id]: { reachable: false, state: 'unknown', message: err instanceof Error ? err.message : String(err) } }))
    }
  }
  async function remove(p: Printer) {
    if (!confirm(`Remover a impressora "${p.name}"?`)) return
    try {
      await printersApi.remove(p.id)
      await printers.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div>
      <div className="page-header"><h1>Configurações</h1></div>
      {error && <div className="alert error">{error}</div>}

      <div className="card">
        <div className="row between">
          <h2 style={{ margin: 0 }}>Impressoras</h2>
          <div className="btn-group">
            <button className="btn" onClick={() => setEditing({ adapter: 'mock', name: 'Impressora simulada (arquivo)' })}>+ Simulada (teste)</button>
            <button className="btn primary" onClick={() => setEditing({ adapter: 'system', model: 'Entrust Sigma DS' })}>+ Entrust Sigma DS</button>
          </div>
        </div>
        <p className="small muted" style={{ marginTop: 6 }}>
          A Sigma DS é usada pelo <strong>driver oficial Entrust (XPS Card Printer Driver)</strong> instalado no Windows (ou driver Linux). Instale o driver, conecte a impressora por USB ou rede, e selecione a fila abaixo. O sistema envia a imagem do cartão em 300 dpi (1013 × 638 px) no tamanho CR80, sem margens. As impressoras são cadastradas por computador: com o banco na nuvem, cada máquina vê e usa só as suas.
        </p>
        {printers.data?.length === 0 && <div className="empty">Nenhuma impressora cadastrada. Adicione a Sigma DS ou uma impressora simulada para testes.</div>}
        {testMsg && <div className="alert info small">{testMsg} <a href="/api/print/calibration.png" target="_blank" rel="noreferrer">Ver o cartão de teste</a></div>}
        {printers.data && printers.data.length > 0 && (
          <table style={{ marginTop: 10 }}>
            <thead><tr><th>Nome</th><th>Tipo</th><th>Fila / rede</th><th>Duplex</th><th>Padrão</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {printers.data.map((p) => {
                const st = statuses[p.id]
                return (
                  <tr key={p.id}>
                    <td>{p.name}<div className="small muted">{p.model}</div></td>
                    <td>{p.adapter === 'system' ? 'Driver do sistema' : 'Simulada (grava PNG)'}</td>
                    <td>{p.systemName ?? '—'}{p.host ? <div className="small muted">{p.host}</div> : null}</td>
                    <td>{p.duplex ? 'Sim' : 'Não'}</td>
                    <td>{p.isDefault ? <span className="badge ok">padrão</span> : <button className="btn small ghost" onClick={async () => { await printersApi.update(p.id, { isDefault: true }); await printers.reload() }}>tornar padrão</button>}</td>
                    <td>
                      {st === 'loading' ? <span className="muted small">verificando…</span> : st ? (
                        <div><span className={`badge ${st.state === 'ready' ? 'ok' : st.state === 'offline' ? 'err' : 'warn'}`}>{stateLabel(st.state)}</span><div className="small muted" style={{ maxWidth: 320 }}>{st.message}</div></div>
                      ) : <button className="btn small" onClick={() => void checkStatus(p)}>Verificar</button>}
                    </td>
                    <td className="num">
                      <div className="btn-group">
                        <button className="btn small" onClick={() => setEditing(p)}>Editar</button>
                        <button className="btn small" onClick={() => void printTest(p)} title="Imprime um cartão com réguas e blocos de cor para conferir alinhamento e cores">Cartão de teste</button>
                        <button className="btn small danger" onClick={() => void remove(p)}>Remover</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <MobileAccessCard lan={info.data?.lan ?? null} />

      <AccountCard onAccountChanged={onAccountChanged} />

      <div className="card">
        <h2>Sistema</h2>
        {info.data && (
          <dl className="kv">
            <dt>Plataforma</dt><dd>{info.data.platform} · Node {info.data.nodeVersion}</dd>
            <dt>Banco de dados</dt>
            <dd>
              {info.data.database.kind === 'postgres' ? <span className="badge ok">Postgres na nuvem</span> : <span className="badge">SQLite local</span>}{' '}
              <span className="mono">{info.data.database.target}</span>
            </dd>
            <dt>Este computador</dt><dd>{info.data.instance.name} <span className="mono small muted">({info.data.instance.id.slice(0, 8)})</span></dd>
            <dt>Pasta de dados</dt><dd className="mono">{info.data.paths.dataDir}</dd>
            <dt>Saída de impressão</dt><dd className="mono">{info.data.paths.printOutputDir}</dd>
          </dl>
        )}
        <p className="small muted" style={{ marginTop: 8 }}>
          {info.data?.database.kind === 'postgres'
            ? 'Fotos, logos, modelos e histórico ficam no banco na nuvem; o backup é feito pelo provedor (Supabase/Neon). Só a saída de impressão fica nesta máquina.'
            : 'Para fazer backup, copie a pasta de dados inteira com o sistema parado. Para usar um banco gratuito na nuvem (Supabase ou Neon), defina a variável DATABASE_URL — veja o README.'}
        </p>
      </div>

      {editing && (
        <PrinterForm initial={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await printers.reload() }} />
      )}
    </div>
  )
}

function MobileAccessCard({ lan }: { lan: { enabled: boolean; urls: string[]; port: number } | null }) {
  const [qrs, setQrs] = useState<Record<string, string>>({})
  useEffect(() => {
    if (!lan?.enabled) return
    let cancelled = false
    ;(async () => {
      const out: Record<string, string> = {}
      for (const url of lan.urls) out[url] = await QRCode.toDataURL(url, { margin: 1, width: 160 })
      if (!cancelled) setQrs(out)
    })()
    return () => {
      cancelled = true
    }
  }, [lan?.enabled, lan?.urls.join(',')])

  return (
    <div className="card">
      <h2>Acesso pelo celular ou tablet</h2>
      {lan?.enabled ? (
        lan.urls.length > 0 ? (
          <>
            <p className="small muted">Conecte o celular na mesma rede Wi-Fi e abra um destes endereços (ou leia o QR code). A tela se adapta ao celular; a foto 3x4 pode ser tirada com a câmera do aparelho.</p>
            <div className="row" style={{ alignItems: 'flex-start', gap: 20 }}>
              {lan.urls.map((url) => (
                <div key={url} className="stack" style={{ alignItems: 'center' }}>
                  {qrs[url] && <img src={qrs[url]} alt={`QR code para ${url}`} width={160} height={160} />}
                  <a href={url} className="mono">{url}</a>
                </div>
              ))}
            </div>
            <p className="small muted" style={{ marginTop: 8 }}>Dica: no celular, use "Adicionar à tela inicial" para abrir o Impress-o como um aplicativo.</p>
          </>
        ) : (
          <div className="alert warning small">O servidor aceita conexões da rede, mas nenhuma rede local foi encontrada neste computador.</div>
        )
      ) : (
        <>
          <p className="small muted">
            Hoje o sistema aceita conexões só deste computador. Para usar pelo celular na mesma rede Wi-Fi, crie (ou edite) o arquivo <code>.env</code> na pasta do sistema com a linha abaixo e reinicie o Impress-o. O endereço e o QR code aparecerão aqui.
          </p>
          <pre className="mono">HOST=0.0.0.0</pre>
          <p className="small muted">A impressora continua sendo a deste computador; o celular só usa a tela (cadastro de pessoas com foto, modelos, envio para impressão).</p>
        </>
      )}
    </div>
  )
}

function stateLabel(s: PrinterStatus['state']): string {
  return { ready: 'pronta', busy: 'ocupada', offline: 'offline', unknown: 'desconhecido' }[s]
}

function AccountCard({ onAccountChanged }: { onAccountChanged: (name: string) => void }) {
  const [name, setName] = useState('')
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setMsg(null)
    if (next && next !== confirm) {
      setMsg({ kind: 'error', text: 'A confirmação da nova senha não confere.' })
      return
    }
    try {
      const r = await authApi.updateAccount({ name: name || undefined, currentPassword: next ? current : undefined, newPassword: next || undefined })
      onAccountChanged(r.userName)
      setMsg({ kind: 'success', text: 'Conta atualizada.' })
      setCurrent('')
      setNext('')
      setConfirm('')
    } catch (err) {
      setMsg({ kind: 'error', text: err instanceof Error ? err.message : String(err) })
    }
  }

  return (
    <div className="card">
      <h2>Usuário do sistema</h2>
      <p className="small muted">O sistema tem um único usuário. Aqui você altera o nome exibido e a senha de acesso.</p>
      <form className="grid cols-2" onSubmit={submit}>
        <label>Novo nome (opcional)<input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <div />
        <label>Senha atual<input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" /></label>
        <div />
        <label>Nova senha<input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={6} /></label>
        <label>Confirmar nova senha<input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" /></label>
        <div className="row" style={{ gridColumn: '1 / -1' }}>
          <button className="btn primary" type="submit" disabled={!name && !next}>Salvar</button>
          {msg && <span className={msg.kind === 'error' ? 'alert error' : 'alert success'} style={{ margin: 0, padding: '6px 10px' }}>{msg.text}</span>}
        </div>
      </form>
    </div>
  )
}
