/**
 * Apoio à inicialização: versão mínima do Node, porta e endereços de escuta,
 * mensagens claras para erros comuns (porta ocupada, banco na nuvem, pasta
 * sem permissão) e abertura do navegador padrão.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

/** Versão mínima do Node.js (o SQLite embutido `node:sqlite` existe a partir da 22.13). */
export const NODE_MINIMO = '22.13.0'
export const PORTA_PADRAO = 3070

function partes(v: string): number[] {
  return v.replace(/^v/, '').split('.').map((x) => Number.parseInt(x, 10) || 0)
}

/** true se `versao` (ex.: "22.13.0") atende ao mínimo exigido. */
export function versaoNodeSuficiente(versao: string = process.versions.node, minimo: string = NODE_MINIMO): boolean {
  const a = partes(versao)
  const b = partes(minimo)
  for (let i = 0; i < 3; i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (x !== y) return x > y
  }
  return true
}

export function mensagemNodeAntigo(versao: string = process.version): string {
  return [
    `A versão do Node.js instalada (${versao}) é antiga demais para o Impress-o.`,
    `É necessário o Node.js ${NODE_MINIMO} ou superior (mesmo o 22.11/22.12 é antigo; a versão LTS atual serve).`,
    'Baixe em https://nodejs.org, instale por cima e inicie o Impress-o de novo.',
    'Se acabou de instalar e esta mensagem continua, feche todas as janelas e abra de novo (ou reinicie o computador):',
    'o Windows ainda pode estar usando o Node antigo — no Prompt de Comando, "where node" mostra qual está em uso.',
  ].join('\n')
}

/** Interpreta a variável PORT: vazia = padrão; inválida = padrão com aviso. */
export function interpretarPorta(valor: string | undefined, padrao: number = PORTA_PADRAO): { port: number; origem: 'env' | 'padrao' | 'invalida' } {
  const v = valor?.trim()
  if (!v) return { port: padrao, origem: 'padrao' }
  const n = /^\d+$/.test(v) ? Number(v) : Number.NaN
  if (!Number.isInteger(n) || n < 1 || n > 65535) return { port: padrao, origem: 'invalida' }
  return { port: n, origem: 'env' }
}

/**
 * Endereços em que o servidor deve escutar. Sem HOST (ou HOST=localhost),
 * escuta em 127.0.0.1 e também em ::1, porque alguns navegadores resolvem
 * "localhost" primeiro para o IPv6. Com outro HOST, respeita só o valor informado.
 */
export function enderecosDeEscuta(hostDefinido: string | undefined): { host: string; obrigatorio: boolean }[] {
  const h = hostDefinido?.trim().toLowerCase()
  if (!h || h === 'localhost') return [{ host: '127.0.0.1', obrigatorio: true }, { host: '::1', obrigatorio: false }]
  return [{ host: h, obrigatorio: true }]
}

/** URL amigável para abrir no navegador deste computador. */
export function urlLocal(host: string, port: number): string {
  const loopback = host === '127.0.0.1' || host === '::1' || host === 'localhost' || host === '0.0.0.0' || host === '::'
  return `http://${loopback ? 'localhost' : host.includes(':') ? `[${host}]` : host}:${port}`
}

/** Traduz erros de `server.listen` para uma orientação em português. */
export function descreverErroDeEscuta(err: NodeJS.ErrnoException, host: string, port: number): string {
  const outra = port === 8070 ? 3070 : 8070
  switch (err.code) {
    case 'EADDRINUSE':
      return `A porta ${port} já está em uso neste computador. O Impress-o já está aberto em outra janela? Feche a outra janela (ou defina outra porta no arquivo .env, por exemplo PORT=${outra}) e inicie de novo.`
    case 'EACCES':
      return `O Windows não permitiu usar a porta ${port} (ela pode estar reservada pelo Hyper-V/WSL — veja com "netsh interface ipv4 show excludedportrange protocol=tcp"). Defina outra porta no arquivo .env, por exemplo PORT=${outra}, e inicie de novo.`
    case 'EADDRNOTAVAIL':
      return `O endereço ${host} não existe neste computador. Confira a variável HOST no arquivo .env (use 127.0.0.1 ou 0.0.0.0).`
    default:
      return `Não foi possível iniciar o servidor em ${host}:${port}: ${err.message}`
  }
}

/** true se já existe um Impress-o respondendo nessa porta (para não abrir uma segunda cópia). */
export async function impressoJaRodando(port: number, host = '127.0.0.1'): Promise<boolean> {
  try {
    const r = await fetch(`http://${host}:${port}/api/auth/status`, { signal: AbortSignal.timeout(2000) })
    if (!r.ok) return false
    const j = (await r.json()) as { setupDone?: unknown }
    return typeof j.setupDone === 'boolean'
  } catch {
    return false
  }
}

/** Garante que a pasta de dados existe e aceita gravação (erro claro antes de abrir o banco). */
export function verificarPastaDeDados(dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
  const sonda = path.join(dir, '.gravacao-teste')
  fs.writeFileSync(sonda, 'ok')
  fs.rmSync(sonda, { force: true })
}

export interface ContextoDeFalha {
  databaseUrl: string | null
  dataDir: string
}

function hostEPortaDoBanco(url: string | null): { hostname: string; port: string } | null {
  if (!url) return null
  try {
    const u = new URL(url)
    return { hostname: u.hostname.toLowerCase(), port: u.port }
  } catch {
    return null
  }
}

/** Dicas em português para as falhas de inicialização mais comuns (além da mensagem original). */
export function explicarFalhaDeInicio(err: unknown, ctx: ContextoDeFalha): string[] {
  const e = err as NodeJS.ErrnoException & { code?: string }
  const code = e?.code ?? ''
  const msg = e instanceof Error ? e.message : String(err)
  const dicas: string[] = []
  const banco = hostEPortaDoBanco(ctx.databaseUrl)

  if (code === 'ERR_UNKNOWN_BUILTIN_MODULE' || /node:sqlite/.test(msg)) {
    dicas.push(mensagemNodeAntigo())
    return dicas
  }
  if (['EPERM', 'EACCES', 'EROFS'].includes(code) || /SQLITE_CANTOPEN|unable to open database|readonly database/i.test(msg)) {
    dicas.push(`Sem permissão para gravar na pasta de dados (${ctx.dataDir}). Mova a pasta do Impress-o para um lugar simples, como C:\\Impress-o (fora de "Arquivos de Programas", de pastas de rede e do OneDrive), ou defina IMPRESSO_DATA_DIR=C:\\Impress-o-dados no arquivo .env.`)
    return dicas
  }
  if (ctx.databaseUrl) {
    if (code === 'ERR_INVALID_URL' || /invalid url/i.test(msg)) {
      dicas.push('A DATABASE_URL não é uma URL válida. Se a senha tem símbolos (# ? / @ %), codifique-os (# vira %23, @ vira %40) ou troque a senha do banco por uma só com letras e números. Confira também se "[YOUR-PASSWORD]" foi substituído pela senha.')
      return dicas
    }
    if (/password authentication failed|autentica/i.test(msg)) {
      dicas.push('O banco recusou a senha da DATABASE_URL. Confira a senha (Project Settings → Database → Reset password no Supabase) e se "[YOUR-PASSWORD]" foi substituído.')
      return dicas
    }
    if (['ENETUNREACH', 'EHOSTUNREACH', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET', 'EAI_AGAIN'].includes(code) || /timeout|connection terminated|getaddrinfo/i.test(msg)) {
      dicas.push(`Não foi possível alcançar o banco na nuvem${code ? ` (${code})` : ''}. Confira a internet e a DATABASE_URL, ou apague a linha DATABASE_URL do .env para usar o banco local (SQLite).`)
      if (banco && /^db\.[a-z0-9]+\.supabase\.co$/.test(banco.hostname)) {
        dicas.push('Esse endereço do Supabase ("Direct connection") só funciona com IPv6, que a maioria das redes não tem. Em Connect, escolha o modo "Session pooler" (endereço ...pooler.supabase.com, porta 5432) e use essa connection string.')
      }
      return dicas
    }
    if (banco?.port === '6543') {
      dicas.push('A DATABASE_URL usa o "Transaction pooler" (porta 6543), que não mantém a configuração de esquema entre consultas. No Supabase, use o modo "Session pooler" (porta 5432).')
    }
  }
  return dicas
}

/** Avisos de configuração que não impedem o início, mas explicam comportamentos estranhos. */
export function avisosDeConfiguracao(opts: { portInvalida: string | null; secureCookies: boolean; hostDefinido: string | undefined; publicUrl: string | undefined }): string[] {
  const avisos: string[] = []
  if (opts.portInvalida !== null) avisos.push(`PORT="${opts.portInvalida}" no .env não é um número de porta válido; usando ${PORTA_PADRAO}.`)
  const loopback = !opts.hostDefinido || ['127.0.0.1', 'localhost', '::1'].includes(opts.hostDefinido.toLowerCase())
  if (opts.secureCookies && !opts.publicUrl && loopback) {
    avisos.push('IMPRESSO_SECURE_COOKIES=1 está ativo sem HTTPS: o login não vai funcionar em http://localhost. Remova essa linha do .env neste computador (ela só serve para hospedagem com HTTPS).')
  }
  return avisos
}

/** Abre a URL no navegador padrão; nunca falha (apenas informa se não conseguir). */
export function abrirNavegador(url: string, platform: NodeJS.Platform = process.platform): boolean {
  // Só URLs simples (http://localhost:3070): nada que o cmd.exe possa interpretar
  if (!/^https?:\/\/[\w.\-\[\]:]+(\/[\w.\-\/]*)?$/.test(url)) return false
  try {
    const child =
      platform === 'win32'
        ? spawn(`start "" "${url}"`, { shell: true, detached: true, stdio: 'ignore', windowsHide: true })
        : platform === 'darwin'
          ? spawn('open', [url], { detached: true, stdio: 'ignore' })
          : spawn('xdg-open', [url], { detached: true, stdio: 'ignore' })
    child.on('error', () => {
      /* sem navegador disponível: o usuário abre a URL manualmente */
    })
    child.unref()
    return true
  } catch {
    return false
  }
}
