@echo off
chcp 65001 >nul
title Impress-o
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale a versao 22 LTS ou superior em https://nodejs.org e execute novamente.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Instalando dependencias pela primeira vez...
  call npm install
  if errorlevel 1 ( echo Falha ao instalar dependencias. & pause & exit /b 1 )
)

if not exist dist\client\index.html (
  echo Compilando a aplicacao...
  call npm run build
  if errorlevel 1 ( echo Falha ao compilar. & pause & exit /b 1 )
)

echo Iniciando o Impress-o em http://localhost:3070 ...
start "" http://localhost:3070
call npm start
pause
