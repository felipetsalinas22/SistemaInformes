// ═══════════════════════════════════════════════════════════════════
//  Worker de vencimientos.
//  Recorre la base en segundo plano: marca el vencimiento y deja la
//  notificación persistida aunque nadie tenga la aplicación abierta.
// ═══════════════════════════════════════════════════════════════════
import { withTransaction } from '../db.js';
import { notifyDeadlineExpired } from './notifications.js';
import { flushPendingNotifications } from './notification-delivery.js';

const DEFAULT_SCAN_MINUTES = 5;

export async function scanExpiredDeadlines() {
  const result = await withTransaction(async (client) => {
    const result = await client.query(
      `SELECT r.id, r.student_id, r.created_by, r.statement_deadline,
              COALESCE(r.student_course_id, s.course_id) AS course_id
       FROM reports r
       JOIN students s ON s.id = r.student_id
       WHERE r.status = 'Pendiente'
         AND r.stage = 'descargo'
         AND r.statement_submitted_at IS NULL
         AND r.statement_deadline < now()
         AND (r.deadline_expired_at IS NULL OR r.deadline_notified_at IS NULL)
       ORDER BY r.statement_deadline ASC
       LIMIT 200
       FOR UPDATE OF r SKIP LOCKED`
    );

    let marked = 0;
    let notified = 0;
    for (const report of result.rows) {
      if (!report.deadline_expired_at) marked += 1;
      if (!report.deadline_notified_at) {
        await notifyDeadlineExpired(client, report);
        notified += 1;
      }
      await client.query(
        `UPDATE reports
         SET deadline_expired_at = COALESCE(deadline_expired_at, now()),
             deadline_notified_at = COALESCE(deadline_notified_at, now()),
             updated_at = now()
         WHERE id = $1`,
        [report.id]
      );
    }
    return { scanned: result.rows.length, marked, notified };
  });
  flushPendingNotifications();
  return result;
}

export function startDeadlineWorker() {
  const minutes = Math.max(1, Number(process.env.DEADLINE_SCAN_MINUTES) || DEFAULT_SCAN_MINUTES);
  const interval = minutes * 60 * 1000;

  scanExpiredDeadlines()
    .then(({ notified }) => {
      if (notified) console.log(`[deadlines] ${notified} vencimiento(s) notificado(s) al iniciar.`);
    })
    .catch(error => console.error('[deadlines] No se pudo completar el escaneo inicial:', error.message));

  const timer = setInterval(() => {
    scanExpiredDeadlines()
      .then(({ notified }) => {
        if (notified) console.log(`[deadlines] ${notified} vencimiento(s) notificado(s).`);
      })
      .catch(error => console.error('[deadlines] Error en escaneo periódico:', error.message));
  }, interval);
  timer.unref();
  return timer;
}
