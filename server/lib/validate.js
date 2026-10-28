import { z } from 'zod';
import { ApiError } from './http.js';

export const emailSchema = z.string().trim().min(5).max(200).email('Mail inválido.').transform(v => v.toLowerCase());
export const passwordSchema = z.string().min(10, 'La contraseña debe tener al menos 10 caracteres.').max(200);
export const nameSchema = z.string().trim().min(3, 'El nombre es demasiado corto.').max(120);

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (formato AAAA-MM-DD).')
  .refine(value => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'Fecha inválida.');

export function parseBody(schema, body) {
  const result = schema.safeParse(body);
  if (!result.success) {
    const details = result.error.issues.map(issue => ({
      field: issue.path.join('.') || null,
      message: issue.message
    }));
    throw ApiError.badRequest(details[0]?.message || 'Datos inválidos.', details);
  }
  return result.data;
}

export function optionalText(max = 5000) {
  return z.string().max(max).optional().default('');
}

export function requiredText(min = 1, max = 5000, message = 'Campo obligatorio.') {
  return z.string().trim().min(min, message).max(max);
}

export function boolSchema() {
  return z.coerce.boolean();
}

export function intIdSchema() {
  return z.coerce.number().int().positive();
}

export function paginationQuery(query) {
  const limit = Math.min(200, Math.max(1, Number(query.limit) || 100));
  const offset = Math.max(0, Number(query.offset) || 0);
  return { limit, offset };
}
