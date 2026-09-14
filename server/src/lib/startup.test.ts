import { describe, expect, it } from 'vitest'
import { abrirNavegador, descreverErroDeEscuta, enderecosDeEscuta, mensagemNodeAntigo, urlLocal, versaoNodeSuficiente } from './startup.js'

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
