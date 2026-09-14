import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import { abrirNavegador, avisosDeConfiguracao, descreverErroDeEscuta, enderecosDeEscuta, explicarFalhaDeInicio, impressoJaRodando, interpretarPorta, mensagemNodeAntigo, urlLocal, verificarPastaDeDados, versaoNodeSuficiente } from './startup.js'

describe('versão mínima do Node', () => {
  it('aceita a versão mínima e superiores', () => {
    expect(versaoNodeSuficiente('22.13.0')).toBe(true)
    expect(versaoNodeSuficiente('v22.13.1')).toBe(true)
    expect(versaoNodeSuficiente('22.22.2')).toBe(true)
    expect(versaoNodeSuficiente('24.21.0')).toBe(true)
    expect(versaoNodeSuficiente('26.8.2')).toBe(true)
  })
  it('rejeita versões antigas', () => {
    expect(versaoNodeSuficiente('22.12.0')).toBe(false)
    expect(versaoNodeSuficiente('22.0.0')).toBe(false)
    expect(versaoNodeSuficiente('20.19.5')).toBe(false)
    expect(versaoNodeSuficiente('18.20.4')).toBe(false)
  })
  it('a versão em execução atende ao mínimo', () => {
    expect(versaoNodeSuficiente()).toBe(true)
  })
  it('explica em português o que fazer', () => {
    const m = mensagemNodeAntigo('v20.19.5')
    expect(m).toContain('v20.19.5')
    expect(m).toContain('22.13.0')
    expect(m).toContain('https://nodejs.org')
  })
})

describe('endereços de escuta', () => {
  it('sem HOST escuta em IPv4 (obrigatório) e IPv6 local (opcional)', () => {
    expect(enderecosDeEscuta(undefined)).toEqual([
      { host: '127.0.0.1', obrigatorio: true },
      { host: '::1', obrigatorio: false },
    ])
  })
  it('com HOST respeita só o valor informado', () => {
    expect(enderecosDeEscuta('0.0.0.0')).toEqual([{ host: '0.0.0.0', obrigatorio: true }])
    expect(enderecosDeEscuta('192.168.0.10')).toEqual([{ host: '192.168.0.10', obrigatorio: true }])
  })
  it('monta a URL amigável', () => {
    expect(urlLocal('127.0.0.1', 3070)).toBe('http://localhost:3070')
    expect(urlLocal('0.0.0.0', 3070)).toBe('http://localhost:3070')
    expect(urlLocal('::1', 3070)).toBe('http://localhost:3070')
    expect(urlLocal('192.168.0.10', 8080)).toBe('http://192.168.0.10:8080')
    expect(urlLocal('fe80::1', 3070)).toBe('http://[fe80::1]:3070')
  })
})

describe('erros de escuta', () => {
  const erro = (code: string, message = 'x'): NodeJS.ErrnoException => Object.assign(new Error(message), { code })
  it('porta ocupada orienta a fechar a outra janela ou trocar a porta', () => {
    const m = descreverErroDeEscuta(erro('EADDRINUSE'), '127.0.0.1', 3070)
    expect(m).toContain('3070')
    expect(m).toContain('outra janela')
    expect(m).toContain('PORT')
  })
  it('endereço inexistente aponta para HOST', () => {
    expect(descreverErroDeEscuta(erro('EADDRNOTAVAIL'), '10.0.0.9', 3070)).toContain('HOST')
    expect(descreverErroDeEscuta(erro('EACCES'), '127.0.0.1', 80)).toContain('PORT')
  })
  it('outros erros mantêm a mensagem original', () => {
    expect(descreverErroDeEscuta(erro('EOUTRO', 'detalhe'), '127.0.0.1', 3070)).toContain('detalhe')
  })
})

describe('abrir navegador', () => {
  it('recusa URLs que o shell poderia interpretar', () => {
    expect(abrirNavegador('http://localhost:3070 & del x', 'win32')).toBe(false)
    expect(abrirNavegador('http://localhost:3070"', 'win32')).toBe(false)
  })
  it('aceita URLs locais simples sem lançar erro', () => {
    // Em ambientes sem navegador o processo filho falha em silêncio
    expect(abrirNavegador('http://localhost:3070', 'linux')).toBe(true)
    expect(abrirNavegador('http://[::1]:3070/', 'linux')).toBe(true)
  })
})

describe('porta e endereços (rodada 2)', () => {
  it('interpreta PORT: vazia = padrão, inválida = padrão com marcação', () => {
    expect(interpretarPorta(undefined)).toEqual({ port: 3070, origem: 'padrao' })
    expect(interpretarPorta('')).toEqual({ port: 3070, origem: 'padrao' })
    expect(interpretarPorta(' 8080 ')).toEqual({ port: 8080, origem: 'env' })
    expect(interpretarPorta('abc')).toEqual({ port: 3070, origem: 'invalida' })
    expect(interpretarPorta('0')).toEqual({ port: 3070, origem: 'invalida' })
    expect(interpretarPorta('70000')).toEqual({ port: 3070, origem: 'invalida' })
    expect(interpretarPorta('3070.5')).toEqual({ port: 3070, origem: 'invalida' })
  })
  it('HOST=localhost escuta nos dois loopbacks (o resolvedor do Windows escolheria só um)', () => {
    expect(enderecosDeEscuta('localhost')).toEqual(enderecosDeEscuta(undefined))
    expect(enderecosDeEscuta(' LOCALHOST ')).toEqual(enderecosDeEscuta(undefined))
  })
  it('EACCES sugere OUTRA porta e o comando netsh', () => {
    const m = descreverErroDeEscuta(Object.assign(new Error('x'), { code: 'EACCES' }), '127.0.0.1', 3070)
    expect(m).toContain('PORT=8070')
    expect(m).toContain('netsh')
    expect(descreverErroDeEscuta(Object.assign(new Error('x'), { code: 'EADDRINUSE' }), '127.0.0.1', 8070)).toContain('PORT=3070')
  })
  it('mensagem de Node antigo cita 22.11/22.12 e o PATH', () => {
    const m = mensagemNodeAntigo('v22.12.0')
    expect(m).toContain('22.12')
    expect(m).toContain('where node')
  })
  it('detecta um Impress-o já em execução e distingue de outro programa', async () => {
    const http = await import('node:http')
    const impresso = http.createServer((_req, res) => res.end(JSON.stringify({ setupDone: true, authenticated: false, userName: null })))
    const outro = http.createServer((_req, res) => res.end('<html>outro programa</html>'))
    await new Promise<void>((r) => impresso.listen(0, '127.0.0.1', r))
    await new Promise<void>((r) => outro.listen(0, '127.0.0.1', r))
    try {
      expect(await impressoJaRodando((impresso.address() as { port: number }).port)).toBe(true)
      expect(await impressoJaRodando((outro.address() as { port: number }).port)).toBe(false)
    } finally {
      impresso.close()
      outro.close()
    }
    // porta livre: ninguém responde
    expect(await impressoJaRodando(1)).toBe(false)
  })
})

describe('dicas para falhas de início', () => {
  const ctx = { databaseUrl: null as string | null, dataDir: 'C:\\Impress-o\\data' }
  const erro = (code: string, message = 'x') => Object.assign(new Error(message), { code })
  it('Node antigo', () => {
    expect(explicarFalhaDeInicio(erro('ERR_UNKNOWN_BUILTIN_MODULE', 'No such built-in module: node:sqlite'), ctx).join('\n')).toContain('nodejs.org')
  })
  it('pasta sem permissão de escrita', () => {
    const d = explicarFalhaDeInicio(erro('EPERM'), ctx).join('\n')
    expect(d).toContain('IMPRESSO_DATA_DIR')
    expect(d).toContain('C:\\Impress-o\\data')
    expect(explicarFalhaDeInicio(new Error('unable to open database file'), ctx).join('\n')).toContain('IMPRESSO_DATA_DIR')
  })
  it('Supabase "Direct connection" (só IPv6) inalcançável', () => {
    const d = explicarFalhaDeInicio(erro('ENETUNREACH'), { ...ctx, databaseUrl: 'postgresql://postgres:s@db.abcdefgh.supabase.co:5432/postgres' }).join('\n')
    expect(d).toContain('Session pooler')
    expect(d).toContain('ENETUNREACH')
  })
  it('banco inalcançável genérico não cita o Supabase', () => {
    const d = explicarFalhaDeInicio(new Error('timeout expired'), { ...ctx, databaseUrl: 'postgresql://u:p@ep-x.neon.tech/db' }).join('\n')
    expect(d).toContain('alcançar o banco')
    expect(d).not.toContain('Session pooler')
  })
  it('senha com símbolos gera URL inválida', () => {
    expect(explicarFalhaDeInicio(erro('ERR_INVALID_URL', 'Invalid URL'), { ...ctx, databaseUrl: 'postgresql://x:a#b@h/db' }).join('\n')).toContain('%23')
  })
  it('senha recusada e Transaction pooler', () => {
    expect(explicarFalhaDeInicio(new Error('password authentication failed for user "postgres"'), { ...ctx, databaseUrl: 'postgresql://u:p@h:5432/db' }).join('\n')).toContain('senha')
    expect(explicarFalhaDeInicio(new Error('relation "impresso.x" does not exist'), { ...ctx, databaseUrl: 'postgresql://u:p@h:6543/db' }).join('\n')).toContain('5432')
  })
  it('sem dica quando não reconhece o erro', () => {
    expect(explicarFalhaDeInicio(new Error('qualquer coisa'), ctx)).toEqual([])
  })
})

describe('avisos de configuração', () => {
  it('PORT inválida e cookie Secure sem HTTPS', () => {
    const a = avisosDeConfiguracao({ portInvalida: 'abc', secureCookies: true, hostDefinido: undefined, publicUrl: undefined })
    expect(a).toHaveLength(2)
    expect(a[0]).toContain('"abc"')
    expect(a[1]).toContain('IMPRESSO_SECURE_COOKIES')
  })
  it('nada a avisar em hospedagem com URL pública', () => {
    expect(avisosDeConfiguracao({ portInvalida: null, secureCookies: true, hostDefinido: '0.0.0.0', publicUrl: 'https://x.onrender.com' })).toEqual([])
  })
  it('pasta de dados gravável passa; caminho impossível falha com código', () => {
    const dir = fs.mkdtempSync(`${os.tmpdir()}/impresso-dados-`)
    expect(() => verificarPastaDeDados(dir)).not.toThrow()
    expect(fs.readdirSync(dir)).toEqual([])
    // Caminho impossível: uma "pasta" dentro de um arquivo comum (ENOTDIR), sem depender de permissões
    const arquivo = `${dir}/arquivo.txt`
    fs.writeFileSync(arquivo, 'x')
    expect(() => verificarPastaDeDados(`${arquivo}/dados`)).toThrow()
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
