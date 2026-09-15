import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import { ERR_ESCUTA, abrirNavegador, avisosDeConfiguracao, descreverErroDeEscuta, enderecoDeSonda, enderecosDeEscuta, erroDeEscuta, explicarFalhaDeInicio, extrairDatabaseUrl, impressoJaRodando, interpretarPorta, mensagemNodeAntigo, mensagemSemPortaLivre, portasCandidatas, urlLocal, verificarPastaDeDados, versaoNodeSuficiente } from './startup.js'

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

describe('rodada 3: sonda, portas candidatas e DATABASE_URL colada', () => {
  it('sonda sempre um endereço conectável', () => {
    expect(enderecoDeSonda('0.0.0.0')).toBe('127.0.0.1')
    expect(enderecoDeSonda('::')).toBe('127.0.0.1')
    expect(enderecoDeSonda('::1')).toBe('127.0.0.1')
    expect(enderecoDeSonda('localhost')).toBe('127.0.0.1')
    expect(enderecoDeSonda(undefined)).toBe('127.0.0.1')
    expect(enderecoDeSonda('192.168.0.10')).toBe('192.168.0.10')
    expect(enderecoDeSonda('fd00::7')).toBe('[fd00::7]')
  })
  it('reconhece o Impress-o mesmo quando o HOST configurado é 0.0.0.0', async () => {
    const http = await import('node:http')
    const srv = http.createServer((_req, res) => res.end(JSON.stringify({ setupDone: false, authenticated: false, userName: null })))
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r))
    try {
      const port = (srv.address() as { port: number }).port
      expect(await impressoJaRodando(port, '0.0.0.0')).toBe(true)
      expect(await impressoJaRodando(port, '::')).toBe(true)
    } finally {
      srv.close()
    }
  })
  it('portas candidatas: quatro seguintes e um bloco distante, sem repetição', () => {
    expect(portasCandidatas(3070)).toEqual([3070, 3071, 3072, 3073, 3074, 8070, 8071, 8072, 8073, 8074])
    expect(portasCandidatas(8070)).toEqual([8070, 8071, 8072, 8073, 8074, 3070, 3071, 3072, 3073, 3074])
    expect(portasCandidatas(65533)).toEqual([65533, 65534, 65535, 8070, 8071, 8072, 8073, 8074])
  })
  it('mensagem sem porta livre distingue reserva do Windows de ocupação', () => {
    expect(mensagemSemPortaLivre(portasCandidatas(3070), 'EACCES')).toContain('netsh')
    expect(mensagemSemPortaLivre(portasCandidatas(3070), 'EADDRINUSE')).toContain('ocupadas')
    expect(mensagemSemPortaLivre(portasCandidatas(3070), 'EADDRINUSE')).toContain('PORT=9090')
  })
  it('erro de escuta tem código próprio e não gera dicas de banco', () => {
    const e = erroDeEscuta(Object.assign(new Error('x'), { code: 'EADDRINUSE' }), '127.0.0.1', 3070)
    expect(e.code).toBe(ERR_ESCUTA)
    expect(e.causa).toBe('EADDRINUSE')
    expect(explicarFalhaDeInicio(e, { databaseUrl: 'postgresql://u:p@h:6543/db', dataDir: 'd' })).toEqual([])
  })
  it('extrai a URI colada com psql ou aspas e ignora valores sem postgresql://', () => {
    expect(extrairDatabaseUrl('postgresql://u:p@h:5432/db')).toEqual({ url: 'postgresql://u:p@h:5432/db', original: null, ignorada: false })
    expect(extrairDatabaseUrl('psql "postgresql://u:p@h:5432/db?sslmode=require"')).toEqual({ url: 'postgresql://u:p@h:5432/db?sslmode=require', original: 'psql "postgresql://u:p@h:5432/db?sslmode=require"', ignorada: false })
    expect(extrairDatabaseUrl("'postgres://u:p@h/db'")).toMatchObject({ url: 'postgres://u:p@h/db', ignorada: false })
    expect(extrairDatabaseUrl('https://abc.supabase.co')).toEqual({ url: null, original: 'https://abc.supabase.co', ignorada: true })
    expect(extrairDatabaseUrl('  ')).toEqual({ url: null, original: null, ignorada: false })
    expect(extrairDatabaseUrl('pglite://memory')).toEqual({ url: 'pglite://memory', original: null, ignorada: false })
  })
  it('avisa sobre DATABASE_URL ignorada ou limpa, e sobre cookie Secure com HOST=0.0.0.0', () => {
    const base = { portInvalida: null, secureCookies: false, hostDefinido: undefined, publicUrl: undefined }
    expect(avisosDeConfiguracao({ ...base, databaseUrlIgnorada: true, databaseUrlOriginal: 'https://abc.supabase.co' })[0]).toContain('ignorada')
    expect(avisosDeConfiguracao({ ...base, databaseUrlIgnorada: false, databaseUrlOriginal: 'psql "postgresql://x"' })[0]).toContain('texto em volta')
    expect(avisosDeConfiguracao({ ...base, secureCookies: true, hostDefinido: '0.0.0.0' })[0]).toContain('celular')
  })
})

describe('rodada 3: dicas novas', () => {
  const ctx = { databaseUrl: 'postgresql://u:p@aws-0-sa-east-1.pooler.supabase.com:5432/postgres', dataDir: 'd' }
  it('EACCES ao conectar é rede/firewall, não pasta', () => {
    const d = explicarFalhaDeInicio(Object.assign(new Error('connect EACCES 1.2.3.4:5432'), { code: 'EACCES', syscall: 'connect' }), ctx).join('\n')
    expect(d).toContain('alcançar o banco')
    expect(d).toContain('firewall')
    expect(d).not.toContain('IMPRESSO_DATA_DIR')
  })
  it('certificado próprio e usuário do pooler', () => {
    expect(explicarFalhaDeInicio(Object.assign(new Error('self-signed certificate in certificate chain'), { code: 'SELF_SIGNED_CERT_IN_CHAIN' }), ctx).join('\n')).toContain('IMPRESSO_DB_SSL')
    expect(explicarFalhaDeInicio(new Error('Tenant or user not found'), ctx).join('\n')).toContain('Restore project')
  })
  it('SQLite corrompido ou bloqueado (só sem banco na nuvem)', () => {
    const local = { databaseUrl: null, dataDir: 'C:\\Impress-o\\data' }
    expect(explicarFalhaDeInicio(Object.assign(new Error('file is not a database'), { code: 'ERR_SQLITE_ERROR' }), local).join('\n')).toContain('corrompido ou bloqueado')
    expect(explicarFalhaDeInicio(new Error('database is locked'), local).join('\n')).toContain('OneDrive')
  })
  it('dica do Transaction pooler só para erros que parecem do banco', () => {
    const t = { ...ctx, databaseUrl: 'postgresql://u:p@h:6543/db' }
    expect(explicarFalhaDeInicio(new Error('relation "impresso.settings" does not exist'), t).join('\n')).toContain('5432')
    expect(explicarFalhaDeInicio(new Error('qualquer outra coisa'), t)).toEqual([])
  })
})
