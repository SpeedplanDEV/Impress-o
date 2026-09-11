#!/usr/bin/env bash
# Inicia o Impress-o (Linux/macOS): instala dependências e compila na primeira vez.
set -e
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js não encontrado. Instale a versão 22 LTS ou superior (https://nodejs.org)."
  exit 1
fi
[ -d node_modules ] || npm install
[ -f dist/client/index.html ] || npm run build
URL="http://localhost:${PORT:-3070}"
echo "Iniciando o Impress-o em $URL ..."
( sleep 2; (command -v xdg-open >/dev/null && xdg-open "$URL") || (command -v open >/dev/null && open "$URL") ) >/dev/null 2>&1 &
npm start
