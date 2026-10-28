import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../auth.js';
import { ApiError, asyncHandler } from '../lib/http.js';
import { canViewAudit } from '../permissions.js';

const router = Router();

router.get('/', requireAuth, asyncHandler(async (req, res) => {
  if (!canViewAudit(req.user)) throw ApiError.forbidden('Sólo un administrador puede consultar la auditoría.');
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
  const params = [];
  const conditions = [];
  if (req.query.action) {
    params.push(String(req.query.action).slice(0, 80));
    conditions.push(`action = $${params.length}`);
  }
  if (req.query.entity) {
    params.push(String(req.query.entity).slice(0, 40));
    conditions.push(`entity = $${params.length}`);
  }
  params.push(limit);

  const result = await query(
    `SELECT a.id, a.actor_user_id, a.actor_email, a.action, a.entity, a.entity_id,
            a.detail, a.ip, a.created_at, u.full_name AS actor_name
     FROM audit_log a
     LEFT JOIN users u ON u.id = a.actor_user_id
     ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
     ORDER BY a.created_at DESC, a.id DESC
     LIMIT $${params.length}`,
    params
  );

  res.json({
    entries: result.rows.map(row => ({
      id: Number(row.id),
      actorId: row.actor_user_id,
      actorName: row.actor_name || 'Sistema',
      actorEmail: row.actor_email,
      action: row.action,
      entity: row.entity,
      entityId: row.entity_id,
      detail: row.detail,
      ip: row.ip,
      createdAt: row.created_at
    }))
  });
}));

export default router;
