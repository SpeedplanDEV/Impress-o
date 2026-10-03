import { describe, expect, it } from 'vitest'
import { gerarCsv, gerarExcel } from './exportar'
import type { Lead } from '@/types/lead'

const lead: Lead = {
  id: '1', codigo: 'LD-0001', nome: 'Ana; "Silva"', empresa: 'A & B', cpf_cnpj: '52998224725',
  telefone: '11987654321', email: 'ana@x.com', cidade: 'São Paulo', uf: 'SP', ibge_id: 3550308,
  interesse: 'Sites', created_at: '2026-10-03T12:00:00Z', updated_at: '2026-10-03T12:00:00Z',
}

describe('exportação', () => {
  it('CSV com BOM, ; e escape', () => {
    const csv = gerarCsv([lead])
    expect(csv.startsWith('﻿Código;Nome')).toBe(true)
    expect(csv).toContain('"Ana; ""Silva"""')
    expect(csv).toContain('529.982.247-25;(11) 98765-4321')
  })
  it('Excel escapa XML', () => {
    const xml = gerarExcel([lead])
    expect(xml).toContain('A &amp; B')
    expect(xml).toContain('<Worksheet ss:Name="Leads">')
  })
})
