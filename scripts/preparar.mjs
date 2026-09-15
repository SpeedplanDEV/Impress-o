#!/usr/bin/env node
/**
 * Prepara o Impress-o para iniciar (usado por iniciar.bat e iniciar.sh):
 *  1. confere a versão do Node.js e explica o que fazer se for antiga;
 *  2. instala as dependências na primeira vez (ou quando o package-lock mudou);
 *  3. compila a aplicação quando ainda não foi compilada ou quando o código mudou.
 * Usa só recursos presentes em qualquer Node moderno (nada de node:sqlite), para
 * conseguir mostrar a mensagem de versão mesmo em um Node antigo.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MINIMO = '22.13.0'
const win = process.platform === 'win32'
const args = new Set(process.argv.slice(2))
/** --iniciar: depois de preparar, inicia o servidor (sem depender do npm no PATH); --navegador: abre o navegador quando pronto. */
const iniciar = args.has('--iniciar')
const navegador = args.has('--navegador')

function partes(v) {
  return String(v).replace(/^v/, '').split('.').map((x) => Number.parseInt(x, 10) || 0)
}
function versaoOk(versao, minimo) {
  const a = partes(versao)
  const b = partes(minimo)
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0)
  }
  return true
}

if (!versaoOk(process.versions.node, MINIMO)) {
  console.error('')
  console.error(`A versão do Node.js instalada (${process.version}) é antiga demais para o Impress-o.`)
  console.error(`É necessário o Node.js ${MINIMO} ou superior (mesmo o 22.11/22.12 é antigo; a versão LTS atual serve).`)
  console.error('Baixe em https://nodejs.org, instale por cima e execute este arquivo de novo.')
  console.error('Se acabou de instalar e esta mensagem continua, feche todas as janelas e abra de novo (ou reinicie o computador):')
  console.error('o Windows ainda pode estar usando o Node antigo — no Prompt de Comando, "where node" mostra qual está em uso.')
  process.exit(1)
}

/** npm que acompanha este Node (não depende do PATH), com fallback para o npm do PATH. */
function comandoNpm() {
  const junto = path.join(path.dirname(process.execPath), win ? 'npm.cmd' : 'npm')
  return fs.existsSync(junto) ? junto : 'npm'
}
function npm(args, descricao) {
  console.log(`\n${descricao}`)
  const cmd = comandoNpm()
  // No Windows, arquivos .cmd só executam pelo shell
  const r = win
    ? spawnSync(`"${cmd}" ${args.join(' ')}`, { cwd: raiz, stdio: 'inherit', shell: true })
    : spawnSync(cmd, args, { cwd: raiz, stdio: 'inherit' })
  if (r.error) {
    console.error(`Não foi possível executar o npm (${r.error.message}). Reinstale o Node.js pelo instalador de https://nodejs.org.`)
    process.exit(1)
  }
  if (r.status !== 0) {
    console.error(`\nO comando "npm ${args.join(' ')}" falhou (código ${r.status}). Leia a mensagem acima.`)
    if (args[0] === 'install') {
      console.error('Dica: a instalação precisa de internet. Se a rede usa proxy, configure-o no npm (npm config set proxy ...).')
      console.error('Se o problema continuar, apague a pasta node_modules e execute de novo; mantenha a pasta do sistema fora do OneDrive.')
    }
    if (args[0] === 'run' && args[1] === 'build') {
      console.error('Dica: se apareceu "tsc" ou "vite" não reconhecido, apague a pasta node_modules e execute de novo; confira também se a variável NODE_ENV=production não está definida no Windows.')
    }
    process.exit(1)
  }
}

function mtime(p) {
  try {
    return fs.statSync(p).mtimeMs
  } catch {
    return null
  }
}
/** Data de modificação mais recente dentro de uma pasta (recursivo). */
function maisRecente(dir) {
  let max = 0
  let entradas = []
  try {
    entradas = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return 0
  }
  for (const e of entradas) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const p = path.join(dir, e.name)
    max = Math.max(max, e.isDirectory() ? maisRecente(p) : mtime(p) || 0)
  }
  return max
}

// Aviso proativo: pastas sincronizadas costumam bloquear arquivos durante npm install e o banco SQLite
if (/[\\/]OneDrive[\\/]/i.test(raiz)) {
  console.warn('Aviso: a pasta do Impress-o está dentro do OneDrive. Se a instalação ou o banco falharem, mova a pasta para C:\\Impress-o.')
}

// 1. Dependências
const lockInstalado = mtime(path.join(raiz, 'node_modules', '.package-lock.json'))
const lockProjeto = mtime(path.join(raiz, 'package-lock.json')) || 0
if (!fs.existsSync(path.join(raiz, 'node_modules')) || lockInstalado === null) {
  npm(['install', '--no-audit', '--no-fund', '--include=dev'], 'Instalando as dependências (só na primeira vez; pode levar alguns minutos, não feche a janela)...')
} else if (lockInstalado < lockProjeto) {
  npm(['install', '--no-audit', '--no-fund', '--include=dev'], 'Atualizando as dependências (o projeto foi atualizado)...')
}

// 2. Compilação
const marcadores = [path.join(raiz, 'dist', 'client', 'index.html'), path.join(raiz, 'dist', 'server', 'src', 'index.js')]
const compiladoEm = Math.min(...marcadores.map((m) => mtime(m) ?? 0))
const fontes = ['client', 'server/src', 'shared', 'package.json', 'vite.config.ts', 'tsconfig.base.json'].map((f) => path.join(raiz, f))
const fonteMaisRecente = Math.max(...fontes.map((f) => (fs.existsSync(f) && fs.statSync(f).isDirectory() ? maisRecente(f) : mtime(f) || 0)))
if (compiladoEm === 0) {
  npm(['run', 'build'], 'Compilando a aplicação (só na primeira vez)...')
} else if (fonteMaisRecente > compiladoEm) {
  npm(['run', 'build'], 'Compilando a aplicação (o código foi atualizado)...')
}

console.log(`\nPronto: Node.js ${process.version}, aplicação compilada.`)

// 3. Início (opcional): mesmo comando do "npm start", chamando o Node atual diretamente
if (iniciar) {
  const env = { ...process.env }
  if (navegador) env.IMPRESSO_OPEN_BROWSER = '1'
  const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', path.join('dist', 'server', 'src', 'index.js')], { cwd: raiz, stdio: 'inherit', env })
  process.exit(r.status ?? 1)
}
