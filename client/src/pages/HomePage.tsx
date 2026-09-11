import { Link } from 'react-router-dom'
import { settingsApi, printersApi, printApi } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { brl, formatDateTime } from '../lib/format'

export default function HomePage() {
  const info = useAsync(() => settingsApi.get())
  const printers = useAsync(() => printersApi.list())
  const jobs = useAsync(() => printApi.jobs(8))
  const c = info.data?.counts

  return (
    <div>
      <div className="page-header">
        <h1>Início</h1>
        <div className="btn-group">
          <Link className="btn primary" to="/impressao">Imprimir cartão</Link>
          <Link className="btn" to="/pessoas">Cadastrar pessoa</Link>
          <Link className="btn" to="/modelos">Modelos de cartão</Link>
        </div>
      </div>
      {info.error && <div className="alert error">{info.error}</div>}
      <div className="grid cols-3">
        <div className="card stat"><span className="muted">Pessoas cadastradas</span><span className="value">{c?.persons ?? '—'}</span></div>
        <div className="card stat"><span className="muted">Empresas / departamentos</span><span className="value">{c ? `${c.companies} / ${c.departments}` : '—'}</span></div>
        <div className="card stat"><span className="muted">Modelos de cartão</span><span className="value">{c?.templates ?? '—'}</span></div>
        <div className="card stat"><span className="muted">Cartões impressos</span><span className="value">{c?.cardsPrinted ?? '—'}</span></div>
        <div className="card stat"><span className="muted">Custo acumulado</span><span className="value">{c ? brl.format(c.totalCost) : '—'}</span></div>
        <div className="card stat">
          <span className="muted">Impressora padrão</span>
          <span className="value" style={{ fontSize: 16 }}>
            {printers.data?.find((p) => p.isDefault)?.name ?? (printers.data?.length === 0 ? <Link to="/configuracoes">Configurar impressora</Link> : '—')}
          </span>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Primeiros passos</h2>
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.8 }}>
          <li><Link to="/configuracoes">Configure a impressora</Link> Entrust Sigma DS (instale o driver oficial e selecione a fila).</li>
          <li><Link to="/empresas">Cadastre empresas e departamentos</Link>, com o logo de cada empresa.</li>
          <li><Link to="/modelos">Crie ou importe modelos de cartão</Link> e defina o modelo padrão de cada departamento.</li>
          <li><Link to="/pessoas">Cadastre as pessoas</Link> com foto 3x4 (arquivo ou webcam) ou importe uma planilha CSV.</li>
          <li><Link to="/custo">Revise os parâmetros de custo</Link> (cartão, fita, mão de obra) para acompanhar o custo de cada impressão.</li>
          <li><Link to="/impressao">Imprima</Link> um cartão ou um lote inteiro.</li>
        </ol>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="row between"><h2 style={{ margin: 0 }}>Últimas impressões</h2><Link to="/impressao">Ver todas</Link></div>
        {jobs.data && jobs.data.length > 0 ? (
          <table style={{ marginTop: 10 }}>
            <thead><tr><th>Data</th><th>Pessoa</th><th>Modelo</th><th>Impressora</th><th className="num">Cópias</th><th className="num">Custo</th><th>Status</th></tr></thead>
            <tbody>
              {jobs.data.map((j) => (
                <tr key={j.id}>
                  <td>{formatDateTime(j.createdAt)}</td>
                  <td>{j.personName ?? '—'}</td>
                  <td>{j.templateName ?? '—'}</td>
                  <td>{j.printerName ?? '—'}</td>
                  <td className="num">{j.copies}</td>
                  <td className="num">{j.totalCost != null ? brl.format(j.totalCost) : '—'}</td>
                  <td><span className={`badge ${j.status === 'done' ? 'ok' : j.status === 'error' ? 'err' : ''}`}>{statusLabel(j.status)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty" style={{ marginTop: 10 }}>Nenhuma impressão registrada ainda.</div>
        )}
      </div>
    </div>
  )
}

export function statusLabel(s: string): string {
  return { queued: 'Na fila', printing: 'Imprimindo', done: 'Concluído', error: 'Erro', cancelled: 'Cancelado' }[s] ?? s
}
