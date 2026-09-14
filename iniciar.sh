#!/usr/bin/env bash
# Inicia o Impress-o (Linux/macOS): confere o Node, instala dependências e compila quando necessário.
set -e
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js não encontrado. Instale a versão LTS (https://nodejs.org) e execute de novo."
  exit 1
fi
node scripts/preparar.mjs
export IMPRESSO_OPEN_BROWSER=1
echo
echo "Iniciando o Impress-o... o navegador abre sozinho em http://localhost:${PORT:-3070} quando estiver pronto."
echo "Mantenha esta janela aberta enquanto usar o sistema. Para encerrar, pressione Ctrl+C."
echo
npm start
