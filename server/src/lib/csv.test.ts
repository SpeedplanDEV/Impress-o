import { describe, expect, it } from 'vitest'
import { parseCsv } from './csv.js'

describe('parseCsv', () => {
  it('detecta ponto e vírgula e respeita aspas', () => {
    const rows = parseCsv('nome;cargo\n"Silva, João";"Analista ""Sr"""\r\nMaria;Gerente\n')
    expect(rows).toEqual([
      ['nome', 'cargo'],
      ['Silva, João', 'Analista "Sr"'],
      ['Maria', 'Gerente'],
    ])
  })
  it('detecta vírgula e BOM', () => {
    expect(parseCsv('﻿a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']])
  })
  it('suporta tabulação', () => {
    expect(parseCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']])
  })
})
