import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Regras do cmd.exe que já quebraram o iniciar.bat: dentro de um bloco "( ... )" um ")" sem escape
 * encerra o bloco; acentos dependem da página de código; todo "goto :rótulo" precisa do rótulo.
 */
describe('iniciar.bat', () => {
  const texto = fs.readFileSync(path.resolve(__dirname, '..', '..', 'iniciar.bat'), 'utf8')
  const linhas = texto.split(/\r?\n/)

  it('é ASCII puro (sem acentos: o cmd lê o arquivo antes do chcp)', () => {
    for (const [i, l] of linhas.entries()) expect({ linha: i + 1, ok: /^[\x00-\x7F]*$/.test(l) }).toEqual({ linha: i + 1, ok: true })
  })

  it('não tem ")" solto em linhas de echo dentro de blocos entre parênteses', () => {
    let profundidade = 0
    for (const [i, l] of linhas.entries()) {
      const semRem = l.trim().toLowerCase().startsWith('rem ') ? '' : l
      if (profundidade > 0 && /^\s*echo\b/i.test(semRem)) {
        const perigoso = /[^^]\)|^\)/.test(semRem.replace(/\^\)/g, ''))
        expect({ linha: i + 1, texto: l, perigoso }).toEqual({ linha: i + 1, texto: l, perigoso: false })
      }
      if (/\($/.test(semRem.trim())) profundidade++
      if (/^\)/.test(semRem.trim())) profundidade = Math.max(0, profundidade - 1)
    }
  })

  it('todo goto aponta para um rótulo existente', () => {
    const rotulos = new Set(linhas.map((l) => /^:(\w+)/.exec(l.trim())?.[1]).filter(Boolean))
    for (const m of texto.matchAll(/goto\s+:(\w+)/gi)) expect(rotulos.has(m[1])).toBe(true)
  })

  it('inicia pelo preparar.mjs sem depender do npm no PATH e trata o código "já aberto"', () => {
    expect(texto).toContain('node scripts\\preparar.mjs --iniciar --navegador')
    expect(texto).not.toMatch(/call npm/)
    expect(texto).toContain('if errorlevel 42 if not errorlevel 43 goto :jaaberto')
  })
})
