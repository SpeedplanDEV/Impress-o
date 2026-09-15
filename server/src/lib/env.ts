/**
 * Carrega o arquivo .env ANTES de qualquer módulo ler process.env.
 * Deve ser o primeiro import de server/src/index.ts. Sem dependências: lê o
 * arquivo, ignora o BOM que o Bloco de Notas costuma gravar e usa util.parseEnv
 * (Node >= 20.12). Variáveis já definidas no ambiente têm prioridade.
 */
import fs from 'node:fs'
import path from 'node:path'
import util from 'node:util'

/** util.parseEnv existe desde o Node 20.12/21.7; em um Node mais antigo usa um leitor simples,
 *  só para a checagem de versão conseguir mostrar a mensagem em português em vez de um erro de import. */
const parse: (texto: string) => Record<string, string | undefined> =
  typeof util.parseEnv === 'function'
    ? util.parseEnv
    : (texto) => {
        const out: Record<string, string | undefined> = {}
        for (const linha of texto.split(/\r?\n/)) {
          const m = /^\s*(?:export\s+)?([\w.-]+)\s*=\s*(.*)$/.exec(linha)
          if (m && !linha.trim().startsWith('#')) out[m[1]] = m[2].trim().replace(/^(["'])(.*)\1$/, '$2')
        }
        return out
      }

const arquivo = path.resolve(process.cwd(), '.env')
try {
  const texto = fs.readFileSync(arquivo, 'utf8').replace(/^\uFEFF/, '')
  for (const [chave, valor] of Object.entries(parse(texto))) {
    if (valor !== undefined && process.env[chave] === undefined) process.env[chave] = valor
  }
} catch (err) {
  const e = err as NodeJS.ErrnoException
  if (e.code === 'ENOENT') {
    if (fs.existsSync(`${arquivo}.txt`)) {
      console.warn('Aviso: existe um arquivo ".env.txt" mas não ".env". Renomeie-o para ".env" (sem .txt) para as configurações valerem.')
    }
  } else {
    console.warn(`Aviso: não foi possível ler o arquivo .env (${e.message}); usando só o ambiente.`)
  }
}
