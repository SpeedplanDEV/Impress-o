import { describe, expect, it } from 'vitest'
import { emptyTemplateDoc, resolveText, validateTemplateDoc } from './template.js'

describe('resolveText', () => {
  it('substitui campos conhecidos e apaga desconhecidos', () => {
    const out = resolveText('Nome: {{full_name}} / {{ role_title }} / {{nada}} / {{extra.x}}', {
      fields: { full_name: 'Ana', role_title: 'Gerente', 'extra.x': 'ok' },
    })
    expect(out).toBe('Nome: Ana / Gerente /  / ok')
  })
})

describe('validateTemplateDoc', () => {
  it('aceita um documento vazio gerado pelo sistema', () => {
    const doc = emptyTemplateDoc('Teste', 'portrait')
    const r = validateTemplateDoc(doc)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.doc.width).toBe(638)
      expect(r.doc.height).toBe(1013)
      expect(r.doc.doubleSided).toBe(false)
    }
  })
  it('rejeita formato desconhecido, versão futura e frente ausente', () => {
    expect(validateTemplateDoc({ format: 'outro' }).ok).toBe(false)
    expect(validateTemplateDoc({ format: 'impress-o/template', version: 99, name: 'x', orientation: 'landscape', front: { fabric: {} } }).ok).toBe(false)
    expect(validateTemplateDoc({ format: 'impress-o/template', version: 1, name: 'x', orientation: 'landscape' }).ok).toBe(false)
    expect(validateTemplateDoc(null).ok).toBe(false)
  })
  it('só marca frente e verso quando o verso existe', () => {
    const base = emptyTemplateDoc('Teste')
    const r = validateTemplateDoc({ ...base, doubleSided: true })
    expect(r.ok && r.doc.doubleSided).toBe(false)
    const r2 = validateTemplateDoc({ ...base, doubleSided: true, back: base.front })
    expect(r2.ok && r2.doc.doubleSided).toBe(true)
  })
})
