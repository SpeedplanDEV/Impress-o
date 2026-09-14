@echo off
chcp 65001 >nul
title Impress-o
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js nao encontrado neste computador.
  echo Instale a versao LTS em https://nodejs.org e execute este arquivo de novo.
  echo.
  pause
  exit /b 1
)

node scripts\preparar.mjs
if errorlevel 1 (
  echo.
  echo Nao foi possivel preparar o Impress-o. Leia a mensagem acima.
  pause
  exit /b 1
)

set IMPRESSO_OPEN_BROWSER=1
echo.
echo Iniciando o Impress-o... o navegador abre sozinho em http://localhost:3070 quando estiver pronto.
echo Mantenha esta janela aberta enquanto usar o sistema. Para encerrar, feche esta janela.
echo.
call npm start
echo.
echo O Impress-o parou. Se apareceu uma mensagem de erro acima, anote-a ou tire uma foto da tela.
pause
