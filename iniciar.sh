#!/usr/bin/env bash
# Inicia o Impress-o (Linux/macOS): confere o Node, instala dependências e compila quando necessário.
set -e
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js não encontrado. Instale a versão LTS (https://nodejs.org) e execute de novo."
  exit 1
fi
echo "Preparando o Impress-o (na primeira vez pode levar alguns minutos)..."
echo "Quando estiver pronto, o navegador abre sozinho. Mantenha esta janela aberta; para encerrar, pressione Ctrl+C."
echo
exec node scripts/preparar.mjs --iniciar --navegador
