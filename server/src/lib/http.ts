import type { ZodType } from 'zod'

export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function parseId(raw: string | undefined): number {
  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Identificador inválido.')
  return id
}

export function validate<T>(schema: ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const where = issue?.path?.length ? `${issue.path.join('.')}: ` : ''
    throw new HttpError(400, `${where}${issue?.message ?? 'Dados inválidos.'}`)
  }
  return parsed.data
}

export function optionalInt(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === '') return null
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}
