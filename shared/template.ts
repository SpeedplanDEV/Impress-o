/**
 * Formato do arquivo de modelo (layout) de cartão do Impress-o.
 *
 * O desenho em si é o JSON do Fabric.js (canvas.toJSON) com propriedades extras
 * em cada objeto que definem o "papel" (role) do elemento — foto 3x4, nome,
 * logo, campo dinâmico, QR code — para que o sistema substitua os dados da
 * pessoa/empresa/departamento na hora de imprimir.
 *
 * Coordenadas: o espaço de desenho é o tamanho real do cartão em pixels a
 * 300 dpi (1013 × 638 paisagem ou 638 × 1013 retrato). O editor apenas aplica
 * zoom para exibir; a exportação usa multiplicador 1.
 */
import type { Orientation } from './card.js'

export const TEMPLATE_FORMAT = 'impress-o/template'
export const TEMPLATE_VERSION = 1

/** Papel de um elemento do layout. */
export type ElementRole =
  | 'static'   // elemento fixo (texto, forma, imagem decorativa)
  | 'photo'    // foto 3x4 da pessoa
  | 'name'     // nome da pessoa (atalho para field=full_name)
  | 'logo'     // logo da empresa
  | 'field'    // campo dinâmico de texto (ver DynamicField)
  | 'qr'       // QR code gerado a partir de um campo/expressão
  | 'barcode'  // reservado (não implementado)

/** Campos dinâmicos que podem ser usados em textos (ex.: "{{full_name}}"). */
export const DYNAMIC_FIELDS = [
  'full_name',
  'display_name',
  'role_title',
  'registration',
  'document',
  'email',
  'phone',
  'valid_until',
  'department',
  'company',
  'company_cnpj',
  'card_number',
  'issue_date',
] as const
export type DynamicField = (typeof DYNAMIC_FIELDS)[number]

export const FIELD_LABELS: Record<DynamicField, string> = {
  full_name: 'Nome completo',
  display_name: 'Nome de exibição',
  role_title: 'Cargo / função',
  registration: 'Matrícula',
  document: 'Documento (CPF/RG)',
  email: 'E-mail',
  phone: 'Telefone',
  valid_until: 'Validade',
  department: 'Departamento',
  company: 'Empresa',
  company_cnpj: 'CNPJ da empresa',
  card_number: 'Número do cartão',
  issue_date: 'Data de emissão',
}

/** Propriedades extras gravadas em cada objeto do Fabric.js. */
export interface ElementMeta {
  role?: ElementRole
  /** Para role=field/qr: nome do campo ou expressão com {{campo}} */
  field?: string
  /** Para role=photo/logo: como encaixar a imagem no espaço */
  fit?: 'cover' | 'contain'
  /** Rótulo mostrado no editor */
  label?: string
  /** Identificador estável do elemento no modelo */
  elementId?: string
  /** Para role=text/field: texto original com {{placeholders}} */
  textTemplate?: string
}

/** Lista das propriedades extras que devem ser serializadas pelo Fabric. */
export const EXTRA_PROPS: (keyof ElementMeta)[] = ['role', 'field', 'fit', 'label', 'elementId', 'textTemplate']

export interface CardSideDesign {
  /** JSON do Fabric.js (StaticCanvas.toJSON(EXTRA_PROPS)). */
  fabric: Record<string, unknown>
  /** Cor de fundo (redundante com fabric.background, mantida para pré-visualização rápida). */
  backgroundColor: string
}

export interface CardTemplateDoc {
  format: typeof TEMPLATE_FORMAT
  version: typeof TEMPLATE_VERSION
  name: string
  orientation: Orientation
  doubleSided: boolean
  dpi: 300
  /** Tamanho do espaço de desenho em px (derivado da orientação). */
  width: number
  height: number
  front: CardSideDesign
  back?: CardSideDesign
  /** Metadados livres (autor, descrição, tags). */
  meta?: Record<string, unknown>
}

/** Dados resolvidos para preencher um cartão. */
export interface CardData {
  fields: Partial<Record<DynamicField, string>> & Record<string, string | undefined>
  /** Data URL ou URL da foto 3x4 já recortada. */
  photoUrl?: string | null
  /** Data URL ou URL do logo da empresa. */
  logoUrl?: string | null
}

/** Substitui {{campo}} pelo valor correspondente (campos desconhecidos viram ""). */
export function resolveText(template: string, data: CardData): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => {
    const v = data.fields[key]
    return v == null ? '' : String(v)
  })
}

export function emptyTemplateDoc(name: string, orientation: Orientation = 'landscape'): CardTemplateDoc {
  const landscape = orientation === 'landscape'
  const width = landscape ? 1013 : 638
  const height = landscape ? 638 : 1013
  return {
    format: TEMPLATE_FORMAT,
    version: TEMPLATE_VERSION,
    name,
    orientation,
    doubleSided: false,
    dpi: 300,
    width,
    height,
    front: { fabric: { version: '7', objects: [], background: '#ffffff' }, backgroundColor: '#ffffff' },
  }
}

/** Validação estrutural leve de um documento importado. */
export function validateTemplateDoc(input: unknown): { ok: true; doc: CardTemplateDoc } | { ok: false; error: string } {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Arquivo não contém um objeto JSON.' }
  const o = input as Record<string, unknown>
  if (o.format !== TEMPLATE_FORMAT) return { ok: false, error: `Formato não reconhecido (esperado "${TEMPLATE_FORMAT}").` }
  if (typeof o.version !== 'number' || o.version > TEMPLATE_VERSION) return { ok: false, error: 'Versão do modelo não suportada.' }
  if (typeof o.name !== 'string' || !o.name.trim()) return { ok: false, error: 'O modelo precisa de um nome.' }
  if (o.orientation !== 'landscape' && o.orientation !== 'portrait') return { ok: false, error: 'Orientação inválida.' }
  const front = o.front as Record<string, unknown> | undefined
  if (!front || typeof front !== 'object' || !front.fabric || typeof front.fabric !== 'object') {
    return { ok: false, error: 'O modelo não possui o desenho da frente.' }
  }
  const landscape = o.orientation === 'landscape'
  const doc: CardTemplateDoc = {
    format: TEMPLATE_FORMAT,
    version: TEMPLATE_VERSION,
    name: (o.name as string).trim(),
    orientation: o.orientation,
    doubleSided: Boolean(o.doubleSided) && !!o.back,
    dpi: 300,
    width: landscape ? 1013 : 638,
    height: landscape ? 638 : 1013,
    front: {
      fabric: front.fabric as Record<string, unknown>,
      backgroundColor: typeof front.backgroundColor === 'string' ? front.backgroundColor : '#ffffff',
    },
    meta: typeof o.meta === 'object' && o.meta ? (o.meta as Record<string, unknown>) : undefined,
  }
  const back = o.back as Record<string, unknown> | undefined
  if (back && typeof back === 'object' && back.fabric && typeof back.fabric === 'object') {
    doc.back = {
      fabric: back.fabric as Record<string, unknown>,
      backgroundColor: typeof back.backgroundColor === 'string' ? back.backgroundColor : '#ffffff',
    }
  }
  return { ok: true, doc }
}
