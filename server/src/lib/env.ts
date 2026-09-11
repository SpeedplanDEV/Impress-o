/**
 * Carrega o arquivo .env ANTES de qualquer módulo ler process.env.
 * Deve ser o primeiro import de server/src/index.ts. Sem dependências:
 * usa process.loadEnvFile (Node >= 20.12), que lança erro se o .env não existir.
 */
try {
  process.loadEnvFile()
} catch {
  /* sem .env: usa só o ambiente */
}
