@echo off
chcp 65001 >nul
title Impress-o
cd /d "%~dp0"

if not exist "scripts\preparar.mjs" (
  echo.
  echo Esta pasta esta incompleta. Se voce baixou o ZIP, extraia-o inteiro para uma pasta fixa
  echo (por exemplo C:\Impress-o) e execute o iniciar.bat de dentro dela.
  echo.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js nao encontrado neste computador.
  echo Instale a versao LTS em https://nodejs.org e execute este arquivo de novo.
  echo.
  pause
  exit /b 1
)

echo Preparando o Impress-o (na primeira vez pode levar alguns minutos)...
echo Quando estiver pronto, o navegador abre sozinho. Mantenha esta janela aberta enquanto usar o sistema.
echo.
node scripts\preparar.mjs --iniciar --navegador
echo.
echo O Impress-o parou. Se apareceu uma mensagem de erro acima, anote-a ou tire uma foto da tela.
pause
