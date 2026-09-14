/**
 * Apoio à inicialização: versão mínima do Node, escuta local em IPv4 e IPv6,
 * mensagens claras para erros de porta e abertura do navegador padrão.
 */
import { spawn } from 'node:child_process'

/** Versão mínima do Node.js (o SQLite embutido `node:sqlite` existe a partir da 22.13). */
export const NODE_MINIMO = '22.13.0'

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
    `É necessário o Node.js ${NODE_MINIMO} ou superior (a versão LTS atual serve).`,
    'Baixe em https://nodejs.org, instale e inicie o Impress-o de novo.',
  ].join('\n')
}

/**
 * Endereços em que o servidor deve escutar. Sem HOST definido, escuta em
 * 127.0.0.1 e também em ::1, porque alguns navegadores resolvem "localhost"
 * primeiro para o IPv6. Com HOST definido, respeita só o valor informado.
 */
export function enderecosDeEscuta(hostDefinido: string | undefined): { host: string; obrigatorio: boolean }[] {
  if (!hostDefinido) return [{ host: '127.0.0.1', obrigatorio: true }, { host: '::1', obrigatorio: false }]
  return [{ host: hostDefinido, obrigatorio: true }]
}

/** URL amigável para abrir no navegador deste computador. */
export function urlLocal(host: string, port: number): string {
  const loopback = host === '127.0.0.1' || host === '::1' || host === 'localhost' || host === '0.0.0.0' || host === '::'
  return `http://${loopback ? 'localhost' : host.includes(':') ? `[${host}]` : host}:${port}`
}

/** Traduz erros de `server.listen` para uma orientação em português. */
export function descreverErroDeEscuta(err: NodeJS.ErrnoException, host: string, port: number): string {
  switch (err.code) {
    case 'EADDRINUSE':
      return `A porta ${port} já está em uso neste computador. O Impress-o já está aberto em outra janela? Feche a outra janela (ou defina outra porta com PORT no arquivo .env) e inicie de novo.`
    case 'EACCES':
      return `Sem permissão para usar a porta ${port}. Escolha outra porta com PORT no arquivo .env (por exemplo, PORT=3070).`
    case 'EADDRNOTAVAIL':
      return `O endereço ${host} não existe neste computador. Confira a variável HOST no arquivo .env (use 127.0.0.1 ou 0.0.0.0).`
    default:
      return `Não foi possível iniciar o servidor em ${host}:${port}: ${err.message}`
  }
}

/** Abre a URL no navegador padrão; nunca falha (apenas registra se não conseguir). */
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
