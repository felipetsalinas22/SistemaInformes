import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { requireAuth, requireCsrf } from '../auth.js';
import { ApiError, asyncHandler } from '../lib/http.js';
import { parseBody } from '../lib/validate.js';
import { writeAudit } from '../lib/audit.js';
import { canManageSettings } from '../permissions.js';

const router = Router();

router.get('/', requireAuth, asyncHandler(async (req, res) => {
  if (!canManageSettings(req.user)) throw ApiError.forbidden('Sólo un administrador puede ver la configuración.');
  const result = await query(
    `SELECT key, value, updated_at,
            (SELECT full_name FROM users WHERE id = settings.updated_by) AS updated_by_name
     FROM settings ORDER BY key`
  );
  res.json({
    settings: Object.fromEntries(result.rows.map(row => [row.key, row.value])),
    details: result.rows
  });
}));

const settingsSchema = z.object({
  statementDays: z.coerce.number().int().min(1).max(30).optional(),
  schoolName: z.string().trim().min(3).max(160).optional()
}).strict();

router.patch('/', requireAuth, requireCsrf, asyncHandler(async (req, res) => {
  if (!canManageSettings(req.user)) throw ApiError.forbidden('Sólo un administrador puede modificar la configuración.');
  const data = parseBody(settingsSchema, req.body);
  if (!Object.keys(data).length) throw ApiError.badRequest('No se recibieron cambios.');

  await withTransaction(async (client) => {
    if (data.statementDays !== undefined) {
      await client.query(
        `INSERT INTO settings (key, value, updated_by) VALUES ('statement_days', $1::jsonb, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [JSON.stringify(data.statementDays), req.user.id]
      );
    }
    if (data.schoolName !== undefined) {
      await client.query(
        `INSERT INTO settings (key, value, updated_by) VALUES ('school_name', $1::jsonb, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [JSON.stringify(data.schoolName), req.user.id]
      );
    }
  });

  await writeAudit({
    actor: req.user, action: 'MODIFICACIÓN_CONFIGURACIÓN', entity: 'settings',
    detail: data, ip: req.ip
  });
  res.json({ ok: true });
}));

export default router;
