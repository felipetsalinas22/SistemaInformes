// Registro de notificaciones. No envía correos: deja constancia en la base
// para que un servicio institucional (SMTP/API) pueda procesarlas luego.

async function insertNotification(client, {
  reportId, recipientUserId = null, recipientType, recipientLabel, type, message, createdBy
}) {
  await client.query(
    `INSERT INTO notifications
       (report_id, recipient_user_id, recipient_type, recipient_label, type, message, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [reportId, recipientUserId, recipientType, recipientLabel, type, message, createdBy]
  );
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
  const result = await client.query(
    `SELECT DISTINCT u.id, u.full_name, u.email, r.code AS role_code
     FROM users u
     JOIN roles r ON r.id = u.role_id
     JOIN user_courses uc ON uc.user_id = u.id
     WHERE uc.course_id = $1 AND u.is_active = TRUE AND r.code = ANY($2::text[])`,
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
      recipientType: 'interno',
      recipientLabel: person.full_name,
      type: 'Informe dictaminado',
      message: `El informe de ${studentName} quedó resuelto. Clasificación: ${report.severity}.`,
      createdBy: actor.id
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
      recipientType: 'interno',
      recipientLabel: person.full_name,
      type: 'Informe anulado',
      message: `El informe de ${studentName} fue anulado. Motivo registrado en el historial.`,
      createdBy: actor.id
    });
  }
}
