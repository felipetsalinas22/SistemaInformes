// Entrega y registro de los correos asociados a las notificaciones.
// El aviso se crea dentro de la transacción del informe; el correo se envía
// después del commit para no dejar una transacción abierta esperando SMTP.
import { query } from '../db.js';
import { normalizeError, sendMail } from './mailer.js';

const STATUSES = {
  notified: 'notificado',
  pending: 'en_proceso',
  error: 'error'
};

function emailBody(notification, report) {
  const student = report ? `${report.student_first_name || ''} ${report.student_last_name || ''}`.trim() : 'un/alumno/a';
  const headline = notification.type || 'Notificación del sistema';
  const text = [
    `Estimado/a ${notification.recipient_label || 'usuario/a'}:`,
    '',
    `${headline}.`,
    notification.message || '',
    '',
    report ? `Informe N° ${report.id} · ${student} · Estado: ${report.status}.` : '',
    'Ingrese al Sistema de Informes de Convivencia para consultar el detalle.',
    '',
    'Escuela Técnica N° 35 D.E. 18 "Ing. Eduardo Latzina"'
  ].filter(Boolean).join('\n');
  return { text, html: `<p>${text.replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>` };
}

export async function deliverNotification(id, { force = false } = {}) {
  const locked = await query(
    `SELECT * FROM notifications WHERE id = $1 FOR UPDATE`,
    [id]
  );
  const notification = locked.rows[0];
  if (!notification) return { status: 'missing', id: Number(id) };
  if (notification.delivery_status === STATUSES.notified && !force) {
    return { status: 'already_sent', id: Number(id) };
  }

  const attempt = Number(notification.delivery_attempts || 0) + 1;
  await query(
    `UPDATE notifications
        SET delivery_status = $2, delivery_attempts = $3, status = 'En proceso',
            last_error = NULL, updated_at = now()
      WHERE id = $1`,
    [id, STATUSES.pending, attempt]
  );

  try {
    if (!notification.recipient_email) {
      throw new Error('La cuenta del destinatario no tiene correo registrado.');
    }
    const reportResult = await query(
      `SELECT r.id, r.status, r.severity, r.reason, s.first_name AS student_first_name,
              s.last_name AS student_last_name
         FROM reports r JOIN students s ON s.id = r.student_id
        WHERE r.id = $1`,
      [notification.report_id]
    );
    const body = emailBody(notification, reportResult.rows[0]);
    await sendMail({
      to: notification.recipient_email,
      subject: `${notification.type || 'Notificación'} · Informe N° ${notification.report_id || '—'}`,
      ...body
    });
    await query(
      `UPDATE notifications
          SET delivery_status = $2, sent_at = now(), last_error = NULL,
              status = 'Notificado/a', updated_at = now()
        WHERE id = $1`,
      [id, STATUSES.notified]
    );
    return { status: 'sent', id: Number(id) };
  } catch (error) {
    const message = normalizeError(error);
    await query(
      `UPDATE notifications
          SET delivery_status = $2, last_error = $3, status = 'Error de envío', updated_at = now()
        WHERE id = $1`,
      [id, STATUSES.error, message]
    );
    return { status: 'error', id: Number(id), error: message };
  }
}

export async function processPendingNotifications(limit = 25) {
  const result = await query(
    `SELECT id FROM notifications
      WHERE delivery_status = $1 AND delivery_attempts < 3 AND recipient_email IS NOT NULL
      ORDER BY id ASC LIMIT $2 FOR UPDATE SKIP LOCKED`,
    [STATUSES.pending, Math.min(100, Math.max(1, Number(limit) || 25))]
  );
  const outcomes = [];
  for (const row of result.rows) {
    outcomes.push(await deliverNotification(row.id));
  }
  return outcomes;
}

/** Encola la entrega de lo pendiente sin bloquear la respuesta de la API. */
export function flushPendingNotifications() {
  return processPendingNotifications().catch(error => {
    console.error('[notificaciones] No se pudo procesar la cola de correos:', error.message);
    return [];
  });
}

export function startNotificationDeliveryWorker() {
  const timer = setInterval(() => {
    processPendingNotifications().catch(error => {
      console.error('[notificaciones] No se pudo procesar la cola de correos:', error.message);
    });
  }, 60_000);
  timer.unref();
}
