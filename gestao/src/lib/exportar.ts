import type { Lead } from '@/types/lead'
import { formatarCpfCnpj, formatarTelefone } from './masks'

const CABECALHO = ['Código', 'Nome', 'Empresa', 'CPF/CNPJ', 'Telefone', 'E-mail', 'Cidade', 'UF', 'Interesse', 'Criado em']

const linha = (l: Lead) => [
  l.codigo,
  l.nome,
  l.empresa ?? '',
  formatarCpfCnpj(l.cpf_cnpj),
  formatarTelefone(l.telefone),
  l.email ?? '',
  l.cidade ?? '',
  l.uf ?? '',
  l.interesse,
  new Date(l.created_at).toLocaleString('pt-BR'),
]

function baixar(conteudo: string, nome: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }))
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const carimbo = () => new Date().toISOString().slice(0, 10)

/** CSV com BOM e separador ";" (abre corretamente no Excel pt-BR). */
export function gerarCsv(leads: Lead[]): string {
  const esc = (v: string) => (/[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  return '﻿' + [CABECALHO, ...leads.map(linha)].map((r) => r.map(esc).join(';')).join('\r\n')
}

/** Planilha Excel (SpreadsheetML 2003, abre no Excel/LibreOffice sem dependências). */
export function gerarExcel(leads: Lead[]): string {
  const x = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const row = (r: string[], estilo = '') =>
    `<Row>${r.map((c) => `<Cell${estilo}><Data ss:Type="String">${x(c)}</Data></Cell>`).join('')}</Row>`
  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles><Style ss:ID="h"><Font ss:Bold="1"/></Style></Styles>
<Worksheet ss:Name="Leads"><Table>
${row(CABECALHO, ' ss:StyleID="h"')}
${leads.map((l) => row(linha(l))).join('\n')}
</Table></Worksheet></Workbook>`
}

export const exportarCsv = (leads: Lead[]) => baixar(gerarCsv(leads), `leads-${carimbo()}.csv`, 'text/csv;charset=utf-8')
export const exportarExcel = (leads: Lead[]) =>
  baixar(gerarExcel(leads), `leads-${carimbo()}.xls`, 'application/vnd.ms-excel')
