import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../auth.js';
import { ApiError, asyncHandler } from '../lib/http.js';
import { addReportScope } from '../lib/scope.js';
import { isAdmin, isDirectivo, isReadonly } from '../permissions.js';

const router = Router();

router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const user = req.user;
  const params = [];
  const reportScope = addReportScope(user, params);
  const conditions = [reportScope];

  if (isAdmin(user)) {
    // El administrador ve el registro completo para tareas de soporte.
  } else if (isDirectivo(user) || isReadonly(user)) {
    conditions.push('(r.id IS NOT NULL)');
  } else {
    params.push(user.id);
    conditions.push(`n.recipient_user_id = $${params.length}`);
  }

  if (req.query.report_id) {
    const reportId = Number(req.query.report_id);
    if (!Number.isInteger(reportId) || reportId < 1) {
      throw ApiError.badRequest('Informe inválido.');
    }
    params.push(reportId);
    conditions.push(`n.report_id = $${params.length}`);
  }

  params.push(Math.min(300, Math.max(1, Number(req.query.limit) || 200)));
  const limitParam = params.length;

  const result = await query(
    `SELECT n.id, n.report_id, n.recipient_type, n.recipient_label, n.type,
            n.message, n.status, n.created_at,
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
      studentName: row.first_name ? `${row.first_name} ${row.last_name}`.trim() : null
    }))
  });
}));

export default router;
