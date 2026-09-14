import { useState, type FormEvent } from 'react'
import { printersApi } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import Modal from './Modal'
import type { Printer, SystemPrinter } from '../lib/types'

/**
 * Formulário de conexão/edição de impressora. Usado em Configurações e na
 * tela de Impressão ("Conectar impressora").
 */
export default function PrinterForm({ initial, onClose, onSaved }: { initial: Partial<Printer>; onClose: () => void; onSaved: (printer: Printer) => Promise<void> }) {
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
      const saved = initial.id ? await printersApi.update(initial.id, body) : await printersApi.create(body)
      await onSaved(saved)
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
                <select value={systemName} onChange={(e) => { setSystemName(e.target.value); if (!name.trim() && e.target.value) setName(e.target.value) }} style={{ flex: 1 }}>
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

