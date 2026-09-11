import { useState, type FormEvent } from 'react'
import { api, authApi, printersApi, settingsApi } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import Modal from '../components/Modal'
import type { Printer, PrinterStatus, SystemPrinter } from '../lib/types'

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
          A Sigma DS é usada pelo <strong>driver oficial Entrust (XPS Card Printer Driver)</strong> instalado no Windows (ou driver Linux). Instale o driver, conecte a impressora por USB ou rede, e selecione a fila abaixo. O sistema envia a imagem do cartão em 300 dpi (1013 × 638 px) no tamanho CR80, sem margens.
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

      <AccountCard onAccountChanged={onAccountChanged} />

      <div className="card">
        <h2>Sistema</h2>
        {info.data && (
          <dl className="kv">
            <dt>Plataforma</dt><dd>{info.data.platform} · Node {info.data.nodeVersion}</dd>
            <dt>Pasta de dados</dt><dd className="mono">{info.data.paths.dataDir}</dd>
            <dt>Banco de dados</dt><dd className="mono">{info.data.paths.dbPath}</dd>
            <dt>Fotos e logos</dt><dd className="mono">{info.data.paths.uploadsDir}</dd>
            <dt>Saída de impressão</dt><dd className="mono">{info.data.paths.printOutputDir}</dd>
          </dl>
        )}
        <p className="small muted" style={{ marginTop: 8 }}>Para fazer backup, copie a pasta de dados inteira com o sistema parado.</p>
      </div>

      {editing && (
        <PrinterForm initial={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await printers.reload() }} />
      )}
    </div>
  )
}

function stateLabel(s: PrinterStatus['state']): string {
  return { ready: 'pronta', busy: 'ocupada', offline: 'offline', unknown: 'desconhecido' }[s]
}

function PrinterForm({ initial, onClose, onSaved }: { initial: Partial<Printer>; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(initial.name ?? '')
  const [adapter, setAdapter] = useState<'system' | 'mock'>(initial.adapter ?? 'system')
  const [systemName, setSystemName] = useState(initial.systemName ?? '')
  const [host, setHost] = useState(initial.host ?? '')
  const [model, setModel] = useState(initial.model ?? 'Entrust Sigma DS')
  const [duplex, setDuplex] = useState(initial.duplex ?? false)
  const [isDefault, setIsDefault] = useState(initial.isDefault ?? false)
  const [options, setOptions] = useState(initial.options ?? {})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [hostCheck, setHostCheck] = useState<string | null>(null)
  const system = useAsync(() => (adapter === 'system' ? printersApi.system() : Promise.resolve(null)), [adapter])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const body = { name, adapter, systemName: systemName || null, host: host || null, model, duplex, isDefault, options }
      if (initial.id) await printersApi.update(initial.id, body)
      else await printersApi.create(body)
      await onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function checkHost() {
    setHostCheck('verificando…')
    try {
      const r = await printersApi.checkHost(host)
      setHostCheck(r.reachable ? `Responde na porta ${r.port} (${r.latencyMs} ms).` : 'Sem resposta. Verifique o IP e se a impressora está ligada e na mesma rede.')
    } catch (err) {
      setHostCheck(err instanceof Error ? err.message : String(err))
    }
  }

  const sysPrinters: SystemPrinter[] = system.data?.printers ?? []
  const isWindows = (system.data?.platform ?? '') === 'win32'

  return (
    <Modal title={initial.id ? 'Editar impressora' : 'Nova impressora'} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <label>Nome de exibição<input value={name} onChange={(e) => setName(e.target.value)} required autoFocus /></label>
        <label>
          Tipo
          <select value={adapter} onChange={(e) => setAdapter(e.target.value as 'system' | 'mock')}>
            <option value="system">Impressora do sistema (driver Entrust Sigma DS)</option>
            <option value="mock">Simulada — grava os cartões como PNG (testes)</option>
          </select>
        </label>
        {adapter === 'system' && (
          <>
            <label>
              Fila de impressão no sistema
              <div className="row">
                <select value={systemName} onChange={(e) => setSystemName(e.target.value)} style={{ flex: 1 }}>
                  <option value="">— selecionar —</option>
                  {sysPrinters.map((p) => <option key={p.name} value={p.name}>{p.name}{p.looksLikeSigma ? ' ★ (Entrust/Sigma)' : ''}{p.driver ? ` — ${p.driver}` : ''}</option>)}
                </select>
                <button type="button" className="btn small" onClick={() => void system.reload()}>Atualizar</button>
              </div>
            </label>
            <input placeholder="ou digite o nome exato da fila" value={systemName} onChange={(e) => setSystemName(e.target.value)} />
            {system.data && sysPrinters.length === 0 && <div className="alert warning small">Nenhuma impressora encontrada no sistema. Instale o driver Entrust e conecte a Sigma DS.</div>}
            <label>
              Endereço IP na rede (opcional, para verificar conectividade / abrir o Printer Dashboard)
              <div className="row">
                <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="192.168.0.50" style={{ flex: 1 }} />
                <button type="button" className="btn small" onClick={() => void checkHost()} disabled={!host}>Testar</button>
              </div>
              {hostCheck && <span className="small">{hostCheck}</span>}
            </label>
            <div className="grid cols-2">
              <label>Modelo<input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Entrust Sigma DS2" /></label>
              <label className="inline" style={{ alignSelf: 'end' }}><input type="checkbox" checked={duplex} onChange={(e) => setDuplex(e.target.checked)} /> Imprime frente e verso (DS2/DS3/DSE)</label>
            </div>
            <fieldset>
              <legend>Opções avançadas</legend>
              <div className="stack">
                {isWindows ? (
                  <label>Nome do tamanho de papel no driver (vazio = detectar "CR80" ou definir 3,375 × 2,125 pol.)<input value={options.paperName ?? ''} onChange={(e) => setOptions({ ...options, paperName: e.target.value })} /></label>
                ) : (
                  <>
                    <label>CUPS: media (padrão Custom.85.6x54mm)<input value={options.cupsMedia ?? ''} onChange={(e) => setOptions({ ...options, cupsMedia: e.target.value })} /></label>
                    <label>CUPS: opções extras (-o chave=valor …)<input value={options.cupsExtra ?? ''} onChange={(e) => setOptions({ ...options, cupsExtra: e.target.value })} /></label>
                  </>
                )}
                <label className="inline"><input type="checkbox" checked={!!options.rotate180} onChange={(e) => setOptions({ ...options, rotate180: e.target.checked })} /> Girar a imagem 180° (se o cartão sair invertido)</label>
                <label className="inline"><input type="checkbox" checked={!!options.duplexShortEdge} onChange={(e) => setOptions({ ...options, duplexShortEdge: e.target.checked })} /> Verso virado pela borda curta (se o verso sair de cabeça para baixo)</label>
                <label className="inline"><input type="checkbox" checked={!!options.keepOutput} onChange={(e) => setOptions({ ...options, keepOutput: e.target.checked })} /> Guardar os PNGs enviados em "Saída de impressão" (auditoria)</label>
              </div>
            </fieldset>
          </>
        )}
        <label className="inline"><input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} /> Impressora padrão</label>
        {error && <div className="alert error">{error}</div>}
        <div className="row end">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </form>
    </Modal>
  )
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
