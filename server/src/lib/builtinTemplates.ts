/**
 * Modelos prontos, no formato do editor (Fabric.js v7 JSON + papéis).
 * Coordenadas em px a 300 dpi: paisagem 1013 × 638, retrato 638 × 1013.
 */
import type { CardTemplateDoc } from '../../../shared/template.js'

type FabricObj = Record<string, unknown>

const text = (o: FabricObj): FabricObj => ({
  type: 'Textbox',
  originX: 'left',
  originY: 'top',
  fontFamily: 'Arial',
  fontWeight: 'normal',
  fill: '#1f2933',
  textAlign: 'left',
  splitByGrapheme: false,
  ...o,
})

const rect = (o: FabricObj): FabricObj => ({ type: 'Rect', originX: 'left', originY: 'top', strokeWidth: 0, ...o })

function photoSlot(left: number, top: number, width: number): FabricObj {
  const height = Math.round((width * 4) / 3)
  return rect({
    left,
    top,
    width,
    height,
    fill: '#dfe6ee',
    stroke: '#9aa8b8',
    strokeWidth: 2,
    strokeDashArray: [10, 8],
    rx: 12,
    ry: 12,
    role: 'photo',
    fit: 'cover',
    label: 'Foto 3x4',
    elementId: 'photo',
  })
}

function logoSlot(left: number, top: number, width: number, height: number): FabricObj {
  return rect({
    left,
    top,
    width,
    height,
    fill: 'rgba(31,95,191,0.08)',
    stroke: '#9aa8b8',
    strokeWidth: 2,
    strokeDashArray: [10, 8],
    role: 'logo',
    fit: 'contain',
    label: 'Logo da empresa',
    elementId: 'logo',
  })
}

function qrSlot(left: number, top: number, size: number, field = '{{registration}}'): FabricObj {
  return rect({
    left,
    top,
    width: size,
    height: size,
    fill: '#ffffff',
    stroke: '#9aa8b8',
    strokeWidth: 2,
    strokeDashArray: [10, 8],
    role: 'qr',
    field,
    label: 'QR code',
    elementId: 'qr',
  })
}

const landscapeCorporate: CardTemplateDoc = {
  format: 'impress-o/template',
  version: 1,
  name: 'Crachá corporativo (paisagem)',
  orientation: 'landscape',
  doubleSided: false,
  dpi: 300,
  width: 1013,
  height: 638,
  front: {
    backgroundColor: '#ffffff',
    fabric: {
      version: '7.4.0',
      background: '#ffffff',
      objects: [
        rect({ left: 0, top: 0, width: 1013, height: 120, fill: '#1f5fbf', role: 'static', label: 'Faixa superior', elementId: 'band' }),
        rect({ left: 0, top: 598, width: 1013, height: 40, fill: '#1f5fbf', role: 'static', label: 'Faixa inferior', elementId: 'band2' }),
        logoSlot(40, 20, 260, 80),
        text({ left: 330, top: 34, width: 640, fontSize: 40, fontWeight: 'bold', fill: '#ffffff', text: '{{company}}', textTemplate: '{{company}}', role: 'field', field: 'company', label: 'Nome da empresa', elementId: 'company' }),
        photoSlot(50, 160, 300),
        text({ left: 390, top: 175, width: 580, fontSize: 52, fontWeight: 'bold', text: '{{display_name}}', textTemplate: '{{display_name}}', role: 'name', field: 'display_name', label: 'Nome', elementId: 'name' }),
        text({ left: 390, top: 260, width: 580, fontSize: 34, fill: '#3b4a5a', text: '{{role_title}}', textTemplate: '{{role_title}}', role: 'field', field: 'role_title', label: 'Cargo', elementId: 'role' }),
        text({ left: 390, top: 320, width: 580, fontSize: 30, fill: '#3b4a5a', text: '{{department}}', textTemplate: '{{department}}', role: 'field', field: 'department', label: 'Departamento', elementId: 'department' }),
        text({ left: 390, top: 420, width: 400, fontSize: 26, fill: '#6b7a8a', text: 'Matrícula: {{registration}}', textTemplate: 'Matrícula: {{registration}}', role: 'field', field: 'registration', label: 'Matrícula', elementId: 'registration' }),
        text({ left: 390, top: 470, width: 400, fontSize: 26, fill: '#6b7a8a', text: 'Validade: {{valid_until}}', textTemplate: 'Validade: {{valid_until}}', role: 'field', field: 'valid_until', label: 'Validade', elementId: 'valid' }),
        qrSlot(820, 400, 160),
      ],
    },
  },
}

const portraitBadge: CardTemplateDoc = {
  format: 'impress-o/template',
  version: 1,
  name: 'Crachá com foto grande (retrato)',
  orientation: 'portrait',
  doubleSided: false,
  dpi: 300,
  width: 638,
  height: 1013,
  front: {
    backgroundColor: '#ffffff',
    fabric: {
      version: '7.4.0',
      background: '#ffffff',
      objects: [
        rect({ left: 0, top: 0, width: 638, height: 150, fill: '#0f3d73', role: 'static', label: 'Faixa superior', elementId: 'band' }),
        logoSlot(60, 25, 518, 100),
        photoSlot(169, 190, 300),
        text({ left: 40, top: 620, width: 558, fontSize: 48, fontWeight: 'bold', textAlign: 'center', text: '{{display_name}}', textTemplate: '{{display_name}}', role: 'name', field: 'display_name', label: 'Nome', elementId: 'name' }),
        text({ left: 40, top: 700, width: 558, fontSize: 32, textAlign: 'center', fill: '#3b4a5a', text: '{{role_title}}', textTemplate: '{{role_title}}', role: 'field', field: 'role_title', label: 'Cargo', elementId: 'role' }),
        text({ left: 40, top: 750, width: 558, fontSize: 28, textAlign: 'center', fill: '#3b4a5a', text: '{{department}}', textTemplate: '{{department}}', role: 'field', field: 'department', label: 'Departamento', elementId: 'department' }),
        rect({ left: 0, top: 860, width: 638, height: 153, fill: '#0f3d73', role: 'static', label: 'Faixa inferior', elementId: 'band2' }),
        text({ left: 40, top: 900, width: 558, fontSize: 30, textAlign: 'center', fill: '#ffffff', text: '{{company}}', textTemplate: '{{company}}', role: 'field', field: 'company', label: 'Empresa', elementId: 'company' }),
        text({ left: 40, top: 945, width: 558, fontSize: 24, textAlign: 'center', fill: '#d6e2f2', text: 'Matrícula {{registration}} · Validade {{valid_until}}', textTemplate: 'Matrícula {{registration}} · Validade {{valid_until}}', role: 'field', field: 'registration', label: 'Matrícula e validade', elementId: 'registration' }),
      ],
    },
  },
}

const simpleVisitor: CardTemplateDoc = {
  format: 'impress-o/template',
  version: 1,
  name: 'Cartão simples (nome e logo)',
  orientation: 'landscape',
  doubleSided: false,
  dpi: 300,
  width: 1013,
  height: 638,
  front: {
    backgroundColor: '#ffffff',
    fabric: {
      version: '7.4.0',
      background: '#ffffff',
      objects: [
        logoSlot(60, 50, 360, 140),
        text({ left: 60, top: 260, width: 890, fontSize: 64, fontWeight: 'bold', text: '{{display_name}}', textTemplate: '{{display_name}}', role: 'name', field: 'display_name', label: 'Nome', elementId: 'name' }),
        text({ left: 60, top: 360, width: 890, fontSize: 36, fill: '#3b4a5a', text: '{{role_title}}', textTemplate: '{{role_title}}', role: 'field', field: 'role_title', label: 'Cargo', elementId: 'role' }),
        rect({ left: 60, top: 540, width: 893, height: 6, fill: '#1f5fbf', role: 'static', label: 'Linha', elementId: 'line' }),
        text({ left: 60, top: 560, width: 890, fontSize: 24, fill: '#6b7a8a', text: '{{company}} · {{department}}', textTemplate: '{{company}} · {{department}}', role: 'field', field: 'company', label: 'Empresa e departamento', elementId: 'company' }),
      ],
    },
  },
}

export const BUILTIN_TEMPLATES: { key: string; name: string; description: string; doc: CardTemplateDoc }[] = [
  { key: 'corporativo-paisagem', name: landscapeCorporate.name, description: 'Faixa colorida, logo, foto 3x4 à esquerda, nome, cargo, departamento, matrícula, validade e QR code.', doc: landscapeCorporate },
  { key: 'retrato-foto-grande', name: portraitBadge.name, description: 'Cartão em pé com logo no topo, foto 3x4 centralizada e dados abaixo.', doc: portraitBadge },
  { key: 'simples', name: simpleVisitor.name, description: 'Apenas logo, nome, cargo e empresa — sem foto.', doc: simpleVisitor },
]
