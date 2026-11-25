// Registro de notificaciones. Cada aviso guarda el correo del destinatario
// para que la cola de entrega pueda enviarlo después del commit.

async function insertNotification(client, {
  reportId, recipientUserId = null, recipientEmail = null, recipientType,
  recipientLabel, type, message, createdBy
}) {
  const result = await client.query(
    `INSERT INTO notifications
       (report_id, recipient_user_id, recipient_email, recipient_type,
        recipient_label, type, message, created_by, delivery_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'en_proceso')
     RETURNING id`,
    [reportId, recipientUserId, recipientEmail || null, recipientType,
      recipientLabel, type, message, createdBy]
  );
  return Number(result.rows[0].id);
}

async function recipientsForStudent(client, studentId) {
  const result = await client.query(
    `SELECT u.id, u.full_name, u.email, r.code AS role_code
     FROM users u
     JOIN roles r ON r.id = u.role_id
     LEFT JOIN tutor_students ts ON ts.tutor_user_id = u.id
     WHERE u.is_active = TRUE
       AND (u.student_id = $1 OR ts.student_id = $1)
       AND r.code IN ('ALUMNO', 'TUTOR')`,
    [studentId]
  );
  return result.rows;
}

async function courseStaff(client, courseId, roleCodes) {
  // Incluye al personal del curso y, además, a los docentes con la función
  // PAT asignada sobre ese curso, sin importar que sean creadores del informe.
  const result = await client.query(
    `SELECT DISTINCT ON (u.id) u.id, u.full_name, u.email,
            CASE WHEN pa.course_id IS NOT NULL THEN 'PAT' ELSE r.code END AS role_code
     FROM users u
     JOIN roles r ON r.id = u.role_id
     LEFT JOIN user_courses uc ON uc.user_id = u.id AND uc.course_id = $1
     LEFT JOIN pat_assignments pa ON pa.user_id = u.id AND pa.course_id = $1
     WHERE u.is_active = TRUE
       AND (
         (uc.course_id IS NOT NULL AND r.code = ANY($2::text[]))
         OR (pa.course_id IS NOT NULL AND r.code = 'PROFESOR')
       )
     ORDER BY u.id, pa.course_id NULLS LAST`,
    [courseId, roleCodes]
  );
  return result.rows;
}

async function creatorOf(client, report) {
  const result = await client.query(
    `SELECT u.id, u.full_name, u.email, r.code AS role_code
     FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1`,
    [report.created_by]
  );
  return result.rows[0] || null;
}

async function studentLabel(client, studentId) {
  const result = await client.query(
    `SELECT first_name, last_name FROM students WHERE id = $1`,
    [studentId]
  );
  const row = result.rows[0];
  return row ? `${row.first_name} ${row.last_name}`.trim() : `Alumno #${studentId}`;
}

export async function notifyReportCreated(client, report, actor) {
  const studentName = await studentLabel(client, report.student_id);
  const family = await recipientsForStudent(client, report.student_id);
  const staff = await courseStaff(client, report.course_id, ['PRECEPTOR', 'PAT', 'DOE']);

  for (const person of family) {
    await insertNotification(client, {
      reportId: report.id,
      recipientUserId: person.id,
      recipientEmail: person.email,
      recipientType: person.role_code === 'ALUMNO' ? 'alumno' : 'familia',
      recipientLabel: person.role_code === 'ALUMNO' ? studentName : `${person.full_name} (${person.email})`,
      type: 'Nuevo informe registrado',
      message: 'Se registró un informe de convivencia. Ingrese al sistema para consultarlo.',
      createdBy: actor.id
    });
  }

  for (const person of staff) {
    await insertNotification(client, {
      reportId: report.id,
      recipientUserId: person.id,
      recipientEmail: person.email,
      recipientType: person.role_code.toLowerCase(),
      recipientLabel: person.full_name,
      type: 'Nuevo informe en su curso',
      message: `Nuevo informe de ${studentName}. Requiere seguimiento según el procedimiento.`,
      createdBy: actor.id
    });
  }
}

export async function notifyStatementSubmitted(client, report, actor) {
  const studentName = await studentLabel(client, report.student_id);
  const creator = await creatorOf(client, report);
  const staff = await courseStaff(client, report.course_id, ['PRECEPTOR', 'PAT', 'DOE']);
  const recipients = [creator, ...staff].filter(Boolean);
  const seen = new Set();

  for (const person of recipients) {
    if (!person || seen.has(person.id)) continue;
    seen.add(person.id);
    await insertNotification(client, {
      reportId: report.id,
      recipientUserId: person.id,
      recipientEmail: person.email,
      recipientType: 'interno',
      recipientLabel: person.full_name,
      type: 'Descargo del alumno presentado',
      message: `${studentName} presentó su descargo. Continúa la etapa de consejos.`,
      createdBy: actor.id
    });
  }
}

export async function notifyDictamen(client, report, actor, { notifyStudent, notifyParent }) {
  const studentName = await studentLabel(client, report.student_id);
  const family = await recipientsForStudent(client, report.student_id);
  const staff = await courseStaff(client, report.course_id, ['PRECEPTOR', 'PAT', 'DOE']);
  const creator = await creatorOf(client, report);

  for (const person of family) {
    const isStudent = person.role_code === 'ALUMNO';
    if (isStudent && !notifyStudent) continue;
    if (!isStudent && !notifyParent) continue;
    await insertNotification(client, {
      reportId: report.id,
      recipientUserId: person.id,
      recipientEmail: person.email,
      recipientType: isStudent ? 'alumno' : 'familia',
      recipientLabel: isStudent ? studentName : `${person.full_name} (${person.email})`,
      type: 'Notificación de dictamen',
      message: `Se emitió el dictamen del informe. Clasificación: ${report.severity}.`,
      createdBy: actor.id
    });
  }

  const internal = [creator, ...staff].filter(Boolean);
  const seen = new Set();
  for (const person of internal) {
    if (seen.has(person.id)) continue;
    seen.add(person.id);
    await insertNotification(client, {
      reportId: report.id,
      recipientUserId: person.id,
      recipientEmail: person.email,
      recipientType: 'interno',
      recipientLabel: person.full_name,
      type: 'Informe dictaminado',
      message: `El informe de ${studentName} quedó resuelto. Clasificación: ${report.severity}.`,
      createdBy: actor.id
    });
  }
}

export async function notifyDeadlineChanged(client, report, actor, extraDays) {
  const studentName = await studentLabel(client, report.student_id);
  const family = await recipientsForStudent(client, report.student_id);
  for (const person of family) {
    await insertNotification(client, {
      reportId: report.id,
      recipientUserId: person.id,
      recipientEmail: person.email,
      recipientType: person.role_code === 'ALUMNO' ? 'alumno' : 'familia',
      recipientLabel: person.role_code === 'ALUMNO' ? studentName : `${person.full_name} (${person.email})`,
      type: 'Plazo de descargo prorrogado',
      message: `La administración prorrogó ${extraDays} día(s) el plazo para presentar el descargo. Nuevo vencimiento: ${new Date(report.statement_deadline).toLocaleString('es-AR')}.`,
      createdBy: actor.id
    });
  }
}

/** Aviso automático del worker de plazos, sin depender de una sesión abierta. */
export async function notifyDeadlineExpired(client, report) {
  const studentName = await studentLabel(client, report.student_id);
  const family = await recipientsForStudent(client, report.student_id);
  const staff = await courseStaff(client, report.course_id, ['PRECEPTOR', 'PAT', 'DOE']);
  const creator = await creatorOf(client, report);
  const recipients = [...family, ...staff, creator].filter(Boolean);
  const seen = new Set();
  const due = report.statement_deadline
    ? new Date(report.statement_deadline).toLocaleString('es-AR')
    : 'fecha no disponible';

  for (const person of recipients) {
    if (seen.has(person.id)) continue;
    seen.add(person.id);
    const isStudent = person.role_code === 'ALUMNO';
    const isFamily = !isStudent && (person.role_code === 'TUTOR' || person.email?.includes('familia'));
    await insertNotification(client, {
      reportId: report.id,
      recipientUserId: person.id,
      recipientEmail: person.email,
      recipientType: isStudent ? 'alumno' : isFamily ? 'familia' : 'interno',
      recipientLabel: isStudent ? studentName : person.full_name,
      type: 'Plazo de descargo vencido',
      message: `Venció el plazo para presentar el descargo del informe de ${studentName} (${due}). La administración puede prorrogarlo si corresponde.`,
      createdBy: report.created_by
    });
  }
}

export async function notifyAnnulment(client, report, actor, motivo) {
  const studentName = await studentLabel(client, report.student_id);
  const family = await recipientsForStudent(client, report.student_id);
  const creator = await creatorOf(client, report);
  const recipients = [creator, ...family].filter(Boolean);
  const seen = new Set();
  for (const person of recipients) {
    if (seen.has(person.id)) continue;
    seen.add(person.id);
    await insertNotification(client, {
      reportId: report.id,
      recipientUserId: person.id,
      recipientEmail: person.email,
      recipientType: 'interno',
      recipientLabel: person.full_name,
      type: 'Informe anulado',
      message: `El informe de ${studentName} fue anulado. Motivo registrado en el historial.`,
      createdBy: actor.id
    });
  }
}
