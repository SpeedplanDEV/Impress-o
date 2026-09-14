/**
 * Carrega o arquivo .env ANTES de qualquer módulo ler process.env.
 * Deve ser o primeiro import de server/src/index.ts. Sem dependências: lê o
 * arquivo, ignora o BOM que o Bloco de Notas costuma gravar e usa util.parseEnv
 * (Node >= 20.12). Variáveis já definidas no ambiente têm prioridade.
 */
import fs from 'node:fs'
import path from 'node:path'
import { parseEnv } from 'node:util'

const arquivo = path.resolve(process.cwd(), '.env')
try {
  const texto = fs.readFileSync(arquivo, 'utf8').replace(/^\uFEFF/, '')
  for (const [chave, valor] of Object.entries(parseEnv(texto))) {
    if (process.env[chave] === undefined) process.env[chave] = valor
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
