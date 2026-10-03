import { describe, expect, it } from 'vitest'
import { formatarCpfCnpj, formatarTelefone, linkWhatsApp, normalizar } from './masks'
import { cnpjValido, cpfValido, emailValido, erroCampo, tipoDocumento } from './validators'

describe('máscaras', () => {
  it('CPF e CNPJ progressivos', () => {
    expect(formatarCpfCnpj('529')).toBe('529')
    expect(formatarCpfCnpj('5299822')).toBe('529.982.2')
    expect(formatarCpfCnpj('52998224725')).toBe('529.982.247-25')
    expect(formatarCpfCnpj('11222333000181')).toBe('11.222.333/0001-81')
    expect(formatarCpfCnpj('11.222.333/0001-81999')).toBe('11.222.333/0001-81')
  })
  it('telefone', () => {
    expect(formatarTelefone('11')).toBe('(11')
    expect(formatarTelefone('1133334444')).toBe('(11) 3333-4444')
    expect(formatarTelefone('11987654321')).toBe('(11) 98765-4321')
  })
  it('whatsapp e normalização', () => {
    expect(linkWhatsApp('(11) 98765-4321')).toBe('https://wa.me/5511987654321')
    expect(linkWhatsApp('123')).toBeNull()
    expect(normalizar(' São Paulo ')).toBe('sao paulo')
  })
})

describe('validadores', () => {
  it('CPF', () => {
    expect(cpfValido('529.982.247-25')).toBe(true)
    expect(cpfValido('529.982.247-24')).toBe(false)
    expect(cpfValido('111.111.111-11')).toBe(false)
  })
  it('CNPJ', () => {
    expect(cnpjValido('11.222.333/0001-81')).toBe(true)
    expect(cnpjValido('11.222.333/0001-80')).toBe(false)
  })
  it('tipo e campos', () => {
    expect(tipoDocumento('')).toBe('')
    expect(tipoDocumento('52998224725')).toBe('cpf')
    expect(tipoDocumento('11222333000181')).toBe('cnpj')
    expect(tipoDocumento('123')).toBeNull()
    expect(emailValido('a@b.com')).toBe(true)
    expect(emailValido('a@b')).toBe(false)
    expect(erroCampo('nome', ' ')).toBe('Informe o nome')
    expect(erroCampo('telefone', '(11) 9876')).toBe('Telefone inválido')
  })
})
