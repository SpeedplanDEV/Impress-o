@echo off
chcp 65001 >nul
title Impress-o
cd /d "%~dp0" || goto :semcd

if not exist "scripts\preparar.mjs" goto :incompleta

where node >nul 2>nul
if not errorlevel 1 goto :temnode
rem Node recem-instalado: o PATH desta janela pode estar desatualizado; tenta os caminhos padrao do instalador
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"
where node >nul 2>nul
if errorlevel 1 goto :semnode
:temnode

echo Preparando o Impress-o. Na primeira vez pode levar alguns minutos; nao feche esta janela.
echo Quando estiver pronto, o navegador abre sozinho. Mantenha esta janela aberta enquanto usar o sistema.
echo.
node scripts\preparar.mjs --iniciar --navegador
if errorlevel 42 if not errorlevel 43 goto :jaaberto
if errorlevel 1 goto :erro
echo.
echo O Impress-o foi encerrado. Esta janela pode ser fechada.
pause
exit /b 0

:jaaberto
echo.
echo O Impress-o ja estava aberto em outra janela e o navegador foi aberto nela.
echo Esta janela pode ser fechada; mantenha aberta a outra.
pause
exit /b 0

:erro
echo.
echo O Impress-o parou com erro. Anote a mensagem acima ou tire uma foto da tela.
pause
exit /b 1

:semcd
echo.
echo Nao foi possivel entrar na pasta do Impress-o. Se ela esta em um caminho de rede, copie-a para o
echo disco local, por exemplo C:\Impress-o, e execute o iniciar.bat de la.
pause
exit /b 1

:incompleta
echo.
echo Esta pasta esta incompleta. Se voce baixou o ZIP, extraia-o inteiro para uma pasta fixa,
echo por exemplo C:\Impress-o, e execute o iniciar.bat de dentro dela.
echo.
pause
exit /b 1

:semnode
echo.
echo Node.js nao encontrado neste computador.
echo Instale a versao LTS em https://nodejs.org e execute este arquivo de novo.
echo Se acabou de instalar, feche todas as janelas e execute de novo, ou reinicie o computador.
echo.
pause
exit /b 1
