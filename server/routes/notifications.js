import { Router } from 'express';
import { requireAuth, requireCsrf } from '../auth.js';
import { query } from '../db.js';
import { ApiError, asyncHandler, parseId } from '../lib/http.js';
import { addReportScope } from '../lib/scope.js';

const router = Router();

async function unreadCountForUser(user) {
  const params = [];
  const conditions = [addReportScope(user, params)];
  params.push(user.id);
  conditions.push(`n.recipient_user_id = $${params.length}`);
  const result = await query(
    `SELECT count(*)::int AS count
     FROM notifications n
     LEFT JOIN reports r ON r.id = n.report_id
     WHERE ${conditions.join(' AND ')} AND n.read_at IS NULL`,
    params
  );
  return result.rows[0]?.count || 0;
}

router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const user = req.user;
  const params = [];
  const conditions = [addReportScope(user, params)];

  // Cada persona ve exclusivamente las notificaciones dirigidas a su cuenta.
  // Ni la administración ni la dirección reciben aquí avisos de terceros.
  params.push(user.id);
  conditions.push(`n.recipient_user_id = $${params.length}`);

  if (req.query.report_id) {
    const reportId = Number(req.query.report_id);
    if (!Number.isInteger(reportId) || reportId < 1) {
      throw ApiError.badRequest('Informe inválido.');
    }
    params.push(reportId);
    conditions.push(`n.report_id = $${params.length}`);
  }

  const countResult = await query(
    `SELECT count(*)::int AS count
     FROM notifications n
     LEFT JOIN reports r ON r.id = n.report_id
     WHERE ${conditions.join(' AND ')} AND n.read_at IS NULL`,
    params
  );

  params.push(Math.min(300, Math.max(1, Number(req.query.limit) || 200)));
  const limitParam = params.length;

  const result = await query(
    `SELECT n.id, n.report_id, n.recipient_type, n.recipient_label, n.type,
            n.message, n.status, n.created_at, n.read_at,
            r.student_id, s.first_name, s.last_name
     FROM notifications n
     LEFT JOIN reports r ON r.id = n.report_id
     LEFT JOIN students s ON s.id = r.student_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY n.created_at DESC, n.id DESC
     LIMIT $${limitParam}`,
    params
  );

  res.json({
    notifications: result.rows.map(row => ({
      id: Number(row.id),
      reportId: row.report_id ? Number(row.report_id) : null,
      recipientType: row.recipient_type,
      recipientLabel: row.recipient_label,
      type: row.type,
      message: row.message,
      status: row.status,
      createdAt: row.created_at,
      readAt: row.read_at,
      isRead: Boolean(row.read_at),
      studentName: row.first_name ? `${row.first_name} ${row.last_name}`.trim() : null
    })),
    unreadCount: countResult.rows[0]?.count || 0
  });
}));

// El historial no se elimina: sólo se registra la fecha de lectura.
router.post('/read-all', requireAuth, requireCsrf, asyncHandler(async (req, res) => {
  const user = req.user;
  const result = await query(
    `UPDATE notifications
     SET read_at = now()
     WHERE recipient_user_id = $1 AND read_at IS NULL`,
    [user.id]
  );
  res.json({ ok: true, marked: result.rowCount, unreadCount: 0 });
}));

router.post('/:id/read', requireAuth, requireCsrf, asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const result = await query(
    `UPDATE notifications
     SET read_at = COALESCE(read_at, now())
     WHERE id = $1 AND recipient_user_id = $2
     RETURNING read_at`,
    [id, req.user.id]
  );
  if (!result.rowCount) throw ApiError.notFound('Notificación no encontrada.');
  res.json({
    ok: true,
    readAt: result.rows[0].read_at,
    unreadCount: await unreadCountForUser(req.user)
  });
}));

export default router;
