#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
//  Datos de demostración con la nómina restaurada del index.html original.
//  Los informes y cuentas siguen siendo de demostración.
//  Uso:
//    npm run db:seed           (sólo si la base no tiene usuarios)
//    npm run db:reset          (borra y vuelve a crear los datos demo)
// ═══════════════════════════════════════════════════════════════════
import { pool, closePool } from '../db.js';
import { hashPassword } from '../lib/password.js';

const RESET = process.argv.includes('--reset');
const FORCE = process.argv.includes('--force');

if (process.env.NODE_ENV === 'production' && !FORCE) {
  console.error('✗ No se ejecuta el seed en producción sin --force. Use server/scripts/create-admin.js.');
  process.exit(1);
}

const ACCOUNTS = [
  { key: 'admin', email: 'admin@et35.demo', password: 'Admin.2026!', name: 'Administrador Demo', role: 'ADMINISTRADOR' },
  { key: 'profesor', email: 'profesor@et35.demo', password: 'Profesor.2026!', name: 'Profesor Demo', role: 'PROFESOR', courses: [0] },
  { key: 'preceptor', email: 'preceptor@et35.demo', password: 'Preceptor.2026!', name: 'Preceptor Demo', role: 'PRECEPTOR', courses: [0] },
  { key: 'pat', email: 'pat@et35.demo', password: 'Pat.2026!', name: 'Equipo PAT Demo', role: 'PAT', courses: [0] },
  { key: 'regente', email: 'regente@et35.demo', password: 'Regente.2026!', name: 'Regente Demo', role: 'REGENTE', scopeAll: true },
  { key: 'rector', email: 'rector@et35.demo', password: 'Rector.2026!', name: 'Rector Demo', role: 'RECTOR', scopeAll: true },
  { key: 'secretaria', email: 'secretaria@et35.demo', password: 'Secretaria.2026!', name: 'Secretaría Demo', role: 'SECRETARIA', scopeAll: true },
  { key: 'alumno', email: 'alumno@et35.demo', password: 'Alumno.2026!', name: 'Guinsburg Mateo', role: 'ALUMNO', studentIndex: 17 },
  { key: 'tutor', email: 'tutor@et35.demo', password: 'Tutor.2026!', name: 'Familia Guinsburg (demo)', role: 'TUTOR', tutorStudents: [17] }
];

const COURSES = [
  { year: 6, division: 2, specialty: 'Computación', shift: 'Tarde' },
  { year: 1, division: 1, specialty: 'Informática', shift: 'Mañana' },
  { year: 2, division: 1, specialty: 'Informática', shift: 'Mañana' },
  { year: 2, division: 2, specialty: 'Electrónica', shift: 'Tarde' },
  { year: 3, division: 1, specialty: 'Electrónica', shift: 'Tarde' },
  { year: 4, division: 1, specialty: 'Química', shift: 'Mañana' },
  { year: 5, division: 1, specialty: 'Construcciones', shift: 'Tarde' }
];

// Nómina restaurada del archivo original. El orden de visualización se
// conserva tal como estaba: la interfaz une first_name + last_name.
// Los informes asociados son de demostración.
const STUDENTS = [
  { first: 'Agustina', last: 'Miranda', dni: '46234001', legajo: null, course: 0, email: 'amiranda@bue.edu.ar', guardian: 'tutor_miranda@gmail.com' },
  { first: 'Andacaba', last: 'Madai', dni: '46234002', legajo: null, course: 0, email: 'amadai@bue.edu.ar', guardian: 'tutor_madai@gmail.com' },
  { first: 'Angulo', last: 'Brunetti Alejo Nahuel', dni: '46234003', legajo: null, course: 0, email: 'aangulo@bue.edu.ar', guardian: 'tutor_angulo@gmail.com' },
  { first: 'Apicella', last: 'Nazareno', dni: '46234004', legajo: null, course: 0, email: 'napicella@bue.edu.ar', guardian: 'tutor_apicella@gmail.com' },
  { first: 'Barreira', last: 'Joaquín', dni: '46234005', legajo: null, course: 0, email: 'jbarreira@bue.edu.ar', guardian: 'tutor_barreira@gmail.com' },
  { first: 'Bartero', last: 'Lautaro', dni: '46234006', legajo: null, course: 0, email: 'lbartero@bue.edu.ar', guardian: 'tutor_bartero@gmail.com' },
  { first: 'Belay', last: 'Piedrabuena Martin', dni: '46234007', legajo: null, course: 0, email: 'mbelay@bue.edu.ar', guardian: 'tutor_belay@gmail.com' },
  { first: 'Choquehuanca', last: 'Marco Antonio', dni: '46234008', legajo: null, course: 0, email: 'mchoquehuanca@bue.edu.ar', guardian: 'tutor_choquehuanca@gmail.com' },
  { first: 'Crespo', last: 'Santino', dni: '46234009', legajo: null, course: 0, email: 'screspo@bue.edu.ar', guardian: 'tutor_crespo@gmail.com' },
  { first: 'Dominguez', last: 'Gamarra Victoria Azul', dni: '46234010', legajo: null, course: 0, email: 'vdominguez@bue.edu.ar', guardian: 'tutor_dominguez@gmail.com' },
  { first: 'Enrique', last: 'Diaz Santino Adrian', dni: '46234011', legajo: null, course: 0, email: 'senrique@bue.edu.ar', guardian: 'tutor_enrique@gmail.com' },
  { first: 'Escalante', last: 'Adrian', dni: '46234012', legajo: null, course: 0, email: 'aescalante@bue.edu.ar', guardian: 'tutor_escalante@gmail.com' },
  { first: 'Espinoza', last: 'Tiziano', dni: '46234013', legajo: null, course: 0, email: 'tespinoza@bue.edu.ar', guardian: 'tutor_espinoza@gmail.com' },
  { first: 'Estrada', last: 'Candiano Jeriel', dni: '46234014', legajo: null, course: 0, email: 'jestrada@bue.edu.ar', guardian: 'tutor_estrada@gmail.com' },
  { first: 'Galíndez', last: 'Sofía Emma', dni: '46234015', legajo: null, course: 0, email: 'sgalindez@bue.edu.ar', guardian: 'tutor_galindez@gmail.com' },
  { first: 'Galván', last: 'Luana', dni: '46234016', legajo: null, course: 0, email: 'lgalvan@bue.edu.ar', guardian: 'tutor_galvan@gmail.com' },
  { first: 'Goncalves', last: 'Guerreiro Luna Morena', dni: '46234017', legajo: null, course: 0, email: 'lgoncalves@bue.edu.ar', guardian: 'tutor_goncalves@gmail.com' },
  { first: 'Guinsburg', last: 'Mateo', dni: '46234018', legajo: null, course: 0, email: 'mguinsburg@bue.edu.ar', guardian: 'tutor_guinsburg@gmail.com' },
  { first: 'Hung', last: 'Nicolás', dni: '46234019', legajo: null, course: 0, email: 'nhung@bue.edu.ar', guardian: 'tutor_hung@gmail.com' },
  { first: 'Iannopollo', last: 'Angeline', dni: '46234020', legajo: null, course: 0, email: 'aiannopollo@bue.edu.ar', guardian: 'tutor_iannopollo@gmail.com' },
  { first: 'Igarzabal', last: 'Felipe', dni: '46234021', legajo: null, course: 0, email: 'figarzabal@bue.edu.ar', guardian: 'tutor_igarzabal@gmail.com' },
  { first: 'Manteiga', last: 'Agustín', dni: '46234022', legajo: null, course: 0, email: 'amanteiga@bue.edu.ar', guardian: 'tutor_manteiga@gmail.com' },
  { first: 'Marquez', last: 'Cristhian', dni: '46234023', legajo: null, course: 0, email: 'cmarquez@bue.edu.ar', guardian: 'tutor_marquez@gmail.com' },
  { first: 'Mateo', last: 'Juárez Giliberti', dni: '46234024', legajo: null, course: 0, email: 'mjuarez@bue.edu.ar', guardian: 'tutor_juarez@gmail.com' },
  { first: 'Mayz', last: 'Valeria', dni: '46234025', legajo: null, course: 0, email: 'vmayz@bue.edu.ar', guardian: 'tutor_mayz@gmail.com' },
  { first: 'Mihovilcevic', last: 'Mirko', dni: '46234026', legajo: null, course: 0, email: 'mmihovilcevic@bue.edu.ar', guardian: 'tutor_mihovilcevic@gmail.com' },
  { first: 'Miranda', last: 'Tobías Andres', dni: '46234027', legajo: null, course: 0, email: 'tmiranda@bue.edu.ar', guardian: 'tutor_miranda2@gmail.com' },
  { first: 'Morelli', last: 'Uziel', dni: '46234028', legajo: null, course: 0, email: 'umorelli@bue.edu.ar', guardian: 'tutor_morelli@gmail.com' },
  { first: 'Muzzi', last: 'Joaquín', dni: '46234029', legajo: null, course: 0, email: 'jmuzzi@bue.edu.ar', guardian: 'tutor_muzzi@gmail.com' },
  { first: 'Navarro', last: 'Patricio', dni: '46234030', legajo: null, course: 0, email: 'pnavarro@bue.edu.ar', guardian: 'tutor_navarro@gmail.com' },
  { first: 'Piñero', last: 'Natanael', dni: '46234031', legajo: null, course: 0, email: 'npinero@bue.edu.ar', guardian: 'tutor_pinero@gmail.com' },
  { first: 'Portaluppi', last: 'Santino', dni: '46234032', legajo: null, course: 0, email: 'sportaluppi@bue.edu.ar', guardian: 'tutor_portaluppi@gmail.com' },
  { first: 'Kohler', last: 'Ramiro', dni: '46234033', legajo: null, course: 0, email: 'rkohler@bue.edu.ar', guardian: 'tutor_kohler@gmail.com' },
  { first: 'Rodrigues', last: 'Joaquín', dni: '46234034', legajo: null, course: 0, email: 'jrodrigues@bue.edu.ar', guardian: 'tutor_rodrigues@gmail.com' },
  { first: 'Rodriguez', last: 'Navarro Juan Alfonso', dni: '46234035', legajo: null, course: 0, email: 'jrodriguez@bue.edu.ar', guardian: 'tutor_rodriguez@gmail.com' },
  { first: 'Salinas', last: 'Felipe', dni: '46234036', legajo: null, course: 0, email: 'fsalinas@bue.edu.ar', guardian: 'tutor_salinas@gmail.com' },
  { first: 'Seiberth', last: 'Valentin', dni: '46234037', legajo: null, course: 0, email: 'vseiberth@bue.edu.ar', guardian: 'tutor_seiberth@gmail.com' },
  { first: 'Siñani', last: 'Matias', dni: '46234038', legajo: null, course: 0, email: 'msinani@bue.edu.ar', guardian: 'tutor_sinani@gmail.com' },
  { first: 'Valentin', last: 'Zamira', dni: '46234039', legajo: null, course: 0, email: 'zvalentin@bue.edu.ar', guardian: 'tutor_valentin@gmail.com' },
  { first: 'Vivacqua', last: 'Antonella', dni: '46234040', legajo: null, course: 0, email: 'avivacqua@bue.edu.ar', guardian: 'tutor_vivacqua@gmail.com' },
  { first: 'Yavi', last: 'Perez Kevin Lucas', dni: '46234041', legajo: null, course: 0, email: 'kyavi@bue.edu.ar', guardian: 'tutor_yavi@gmail.com' }
];

function daysFromNow(days) {
  return new Date(Date.now() + days * 86400000).toISOString();
}

async function main() {
  const client = await pool.connect();
  try {
    const userCount = await client.query('SELECT count(*)::int AS total FROM users');
    if (userCount.rows[0].total > 0 && !RESET) {
      console.error('✗ La base ya tiene usuarios. Ejecute "npm run db:reset" para recrear los datos de demostración.');
      process.exitCode = 1;
      return;
    }

    await client.query('BEGIN');

    if (RESET) {
      await client.query(`
        TRUNCATE report_history, notifications, audit_log, sessions, reports,
                 tutor_students, user_courses, users, students, courses
        RESTART IDENTITY CASCADE
      `);
      console.log('• Datos anteriores eliminados.');
    }

    const roleRows = await client.query('SELECT id, code FROM roles');
    const roleIds = Object.fromEntries(roleRows.rows.map(row => [row.code, row.id]));

    const courseIds = [];
    for (const course of COURSES) {
      const result = await client.query(
        `INSERT INTO courses (year, division, specialty, shift) VALUES ($1, $2, $3, $4)
         ON CONFLICT (year, division, specialty) DO UPDATE SET shift = EXCLUDED.shift, is_active = TRUE
         RETURNING id`,
        [course.year, course.division, course.specialty, course.shift]
      );
      courseIds.push(result.rows[0].id);
    }
    console.log(`• ${courseIds.length} cursos creados.`);

    const studentIds = [];
    for (let index = 0; index < STUDENTS.length; index += 1) {
      const student = STUDENTS[index];
      const result = await client.query(
        `INSERT INTO students (first_name, last_name, dni, legajo, course_id, email, guardian_email, birth_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          student.first, student.last, student.dni, student.legajo, courseIds[student.course],
          student.email, student.guardian, student.birth || null
        ]
      );
      studentIds.push(result.rows[0].id);
    }
    console.log(`• ${studentIds.length} alumnos de la nómina original restaurados.`);

    const userIds = {};
    for (const account of ACCOUNTS) {
      const hash = await hashPassword(account.password);
      const inserted = await client.query(
        `INSERT INTO users (email, password_hash, full_name, role_id, student_id, scope_all,
                            is_active, must_change_password, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE, FALSE, NULL)
         RETURNING id`,
        [
          account.email, hash, account.name, roleIds[account.role],
          account.studentIndex !== undefined ? studentIds[account.studentIndex] : null,
          Boolean(account.scopeAll)
        ]
      );
      userIds[account.key] = inserted.rows[0].id;

      for (const courseIndex of account.courses || []) {
        await client.query(
          'INSERT INTO user_courses (user_id, course_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [inserted.rows[0].id, courseIds[courseIndex]]
        );
      }
      for (const studentIndex of account.tutorStudents || []) {
        await client.query(
          'INSERT INTO tutor_students (tutor_user_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [inserted.rows[0].id, studentIds[studentIndex]]
        );
      }
    }
    console.log(`• ${ACCOUNTS.length} cuentas demo creadas.`);

    async function createReport(data) {
      const student = STUDENTS[data.studentIndex];
      const course = COURSES[student.course];
      const courseId = courseIds[student.course];
      const creator = ACCOUNTS.find(item => item.key === data.createdBy);
      const result = await client.query(
        `INSERT INTO reports
          (student_id, created_by, issuer_name, issuer_role, issuer_email, issue_date,
           reason, description, student_text, statement_submitted_at, statement_deadline,
           preceptor_notes, pat_notes, council_notes, additional_notes, severity,
           other_considerations, director_signature, director_date, director_user_id,
           notify_student, notify_parent, status, stage, previous_status,
           student_course_id, student_first_name, student_last_name, student_name,
           student_dni, student_year, student_division, student_specialty, student_shift,
           student_legajo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
                 $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35)
         RETURNING id`,
        [
          studentIds[data.studentIndex], userIds[data.createdBy], creator.name,
          data.issuerRole || 'Profesor/a', creator.email,
          data.issueDate, data.reason, data.description,
          data.studentText || '',
          data.statementSubmittedAt || null,
          data.statementDeadline,
          data.preceptorNotes || '', data.patNotes || '', data.councilNotes || '',
          data.additionalNotes || '', data.severity || 'SUSPENSO',
          data.otherConsiderations || '', data.directorSignature || 'No Firmado',
          data.directorDate || null,
          data.directorBy ? userIds[data.directorBy] : null,
          Boolean(data.notifyStudent), Boolean(data.notifyParent),
          data.status || 'Pendiente', data.stage || 'descargo',
          data.previousStatus || null,
          courseId, student.first, student.last, `${student.first} ${student.last}`.trim(),
          student.dni, course.year, course.division, course.specialty, course.shift,
          student.legajo
        ]
      );
      const reportId = result.rows[0].id;
      for (const entry of data.history || []) {
        const actor = entry.actor ? ACCOUNTS.find(item => item.key === entry.actor) : null;
        await client.query(
          `INSERT INTO report_history (report_id, action, actor_user_id, actor_name, actor_role, description, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, now() - ($7::int * interval '1 day'))`,
          [
            reportId, entry.action, actor ? userIds[actor.key] : null,
            entry.actorName || actor?.name || 'Sistema', actor?.role || 'SISTEMA',
            entry.description, entry.daysAgo || 0
          ]
        );
      }
      return reportId;
    }

    const report1 = await createReport({
      studentIndex: 17,
      createdBy: 'profesor',
      issueDate: new Date().toISOString().slice(0, 10),
      reason: 'Interrupción reiterada de la clase de taller',
      description: 'Durante la clase del día se registraron interrupciones reiteradas y falta de respeto hacia el docente. Se informó a preceptoría en el momento. (Hecho ficticio para la demostración.)',
      statementDeadline: daysFromNow(5),
      stage: 'descargo',
      history: [
        { actor: 'profesor', action: 'CREACIÓN', description: 'Informe creado. Motivo: Interrupción reiterada de la clase de taller.', daysAgo: 0 }
      ]
    });

    const report2 = await createReport({
      studentIndex: 0,
      createdBy: 'profesor',
      issueDate: new Date().toISOString().slice(0, 10),
      reason: 'Uso de teléfono en horario de taller',
      description: 'Se solicitó en dos oportunidades guardar el teléfono durante la actividad práctica. El alumno respondió de forma desafiante. (Hecho ficticio.)',
      statementDeadline: daysFromNow(-1),
      studentText: 'Reconozco que usé el teléfono en clase y que respondí mal cuando me lo pidieron. (Descargo ficticio.)',
      statementSubmittedAt: new Date().toISOString(),
      preceptorNotes: 'Se conversó con el alumno y se acordó un compromiso de conducta para las próximas clases. (Nota ficticia.)',
      stage: 'consejos',
      history: [
        { actor: 'profesor', action: 'CREACIÓN', description: 'Informe creado. Motivo: Uso de teléfono en horario de taller.', daysAgo: 3 },
        { actor: null, actorName: 'Alumno/a (ficticio)', action: 'DESCARGO', description: 'El alumno presentó su descargo.', daysAgo: 2 },
        { actor: 'preceptor', action: 'INTERVENCIÓN_PRECEPTOR', description: 'Se actualizaron las observaciones de preceptoría.', daysAgo: 1 }
      ]
    });

    const report3 = await createReport({
      studentIndex: 1,
      createdBy: 'profesor',
      issueDate: '2026-09-15',
      reason: 'Daño a equipamiento del taller',
      description: 'Se detectó daño intencional a una herramienta del taller. Se labró el registro correspondiente. (Hecho ficticio.)',
      statementDeadline: '2026-09-20 23:59:00-03',
      studentText: 'No participé del daño, pero reconozco que no avisé cuando lo vi. (Descargo ficticio.)',
      statementSubmittedAt: '2026-09-17 10:30:00-03',
      preceptorNotes: 'Se habló con el grupo y se identificaron responsables. (Nota ficticia.)',
      patNotes: 'Se sugiere medida reparatoria y seguimiento quincenal. (Informe PAT ficticio.)',
      councilNotes: 'El Consejo de Convivencia evaluó el hecho y propuso una medida reparatoria. (Acta ficticia.)',
      additionalNotes: 'Se informó a la familia por los canales institucionales. (Aclaración ficticia.)',
      severity: 'GRAVE',
      otherConsiderations: 'Reparación del equipamiento y taller de convivencia.',
      directorSignature: 'FIRMADO_AUTORIDAD_DEMO',
      directorDate: '2026-09-22',
      directorBy: 'regente',
      notifyStudent: true,
      notifyParent: true,
      status: 'Resuelto',
      stage: 'notificado',
      history: [
        { actor: 'profesor', action: 'CREACIÓN', description: 'Informe creado. Motivo: Daño a equipamiento del taller.', daysAgo: 20 },
        { actor: null, actorName: 'Alumno/a (ficticio)', action: 'DESCARGO', description: 'El alumno presentó su descargo.', daysAgo: 18 },
        { actor: 'preceptor', action: 'INTERVENCIÓN_PRECEPTOR', description: 'Se actualizaron las observaciones de preceptoría.', daysAgo: 17 },
        { actor: 'pat', action: 'INTERVENCIÓN_PAT', description: 'Se actualizó el informe PAT / Consejo de Aula.', daysAgo: 16 },
        { actor: 'regente', action: 'DICTAMEN', description: 'Dictamen emitido. Clasificación: GRAVE. Reparación del equipamiento y taller de convivencia.', daysAgo: 14 }
      ]
    });

    const report4 = await createReport({
      studentIndex: 2,
      createdBy: 'profesor',
      issueDate: new Date().toISOString().slice(0, 10),
      reason: 'Llegadas tarde reiteradas',
      description: 'Se registraron tres llegadas tarde en la misma semana, sin justificación presentada. (Hecho ficticio.)',
      statementDeadline: daysFromNow(-2),
      studentText: 'Llegué tarde porque el colectivo se retrasó. (Descargo ficticio.)',
      statementSubmittedAt: new Date().toISOString(),
      preceptorNotes: 'Se verificó la versión del alumno con la familia. (Nota ficticia.)',
      patNotes: 'Se propone acuerdo de puntualidad. (Informe PAT ficticio.)',
      councilNotes: 'Se sugiere medida pedagógica de seguimiento. (Acta ficticia.)',
      additionalNotes: 'Pendiente de firma de la autoridad. (Aclaración ficticia.)',
      severity: 'LEVE',
      otherConsiderations: 'Acuerdo de puntualidad con seguimiento del preceptor.',
      stage: 'dictamen',
      history: [
        { actor: 'profesor', action: 'CREACIÓN', description: 'Informe creado. Motivo: Llegadas tarde reiteradas.', daysAgo: 5 },
        { actor: null, actorName: 'Alumno/a (ficticio)', action: 'DESCARGO', description: 'El alumno presentó su descargo.', daysAgo: 4 },
        { actor: 'preceptor', action: 'INTERVENCIÓN_PRECEPTOR', description: 'Se actualizaron las observaciones de preceptoría.', daysAgo: 3 },
        { actor: 'pat', action: 'INTERVENCIÓN_PAT', description: 'Se actualizó el informe PAT / Consejo de Aula.', daysAgo: 2 },
        { actor: 'regente', action: 'DICTAMEN_PARCIAL', description: 'Se guardaron datos del dictamen sin fecha de cierre.', daysAgo: 1 }
      ]
    });

    const report5 = await createReport({
      studentIndex: 3,
      createdBy: 'profesor',
      issueDate: '2026-08-10',
      reason: 'Falta de respeto a un compañero',
      description: 'Registro inicial que luego fue anulado por un error de identificación del alumno. (Hecho ficticio.)',
      statementDeadline: '2026-08-15 23:59:00-03',
      status: 'Anulado',
      stage: 'descargo',
      previousStatus: 'Pendiente',
      history: [
        { actor: 'profesor', action: 'CREACIÓN', description: 'Informe creado. Motivo: Falta de respeto a un compañero.', daysAgo: 40 },
        { actor: 'regente', action: 'ANULADO', description: 'Informe anulado. Motivo: error de identificación del alumno. Estado anterior: Pendiente.', daysAgo: 39 }
      ]
    });

    // Notificaciones internas de ejemplo (registro, sin envío de correo).
    const notifications = [
      { reportId: report1, userKey: 'preceptor', recipientType: 'interno', type: 'Nuevo informe en su curso', message: 'Nuevo informe de Guinsburg Mateo. Requiere seguimiento según el procedimiento.' },
      { reportId: report1, userKey: 'alumno', recipientType: 'alumno', type: 'Nuevo informe registrado', message: 'Se registró un informe de convivencia. Ingrese para consultarlo.' },
      { reportId: report2, userKey: 'pat', recipientType: 'interno', type: 'Descargo del alumno presentado', message: 'Agustina Miranda presentó su descargo. Continúa la etapa de consejos.' },
      { reportId: report3, userKey: 'secretaria', recipientType: 'interno', type: 'Informe dictaminado', message: 'El informe de Andacaba Madai quedó resuelto. Clasificación: GRAVE.' },
      { reportId: report4, userKey: 'preceptor', recipientType: 'interno', type: 'Nuevo informe en su curso', message: 'Nuevo informe de Angulo Brunetti Alejo Nahuel. Requiere seguimiento.' }
    ];
    for (const item of notifications) {
      const account = ACCOUNTS.find(account => account.key === item.userKey);
      await client.query(
        `INSERT INTO notifications (report_id, recipient_user_id, recipient_type, recipient_label, type, message, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [item.reportId, userIds[item.userKey], item.recipientType, account.name, item.type, item.message, userIds.profesor]
      );
    }

    await client.query(
      `INSERT INTO settings (key, value) VALUES
         ('statement_days', '5'::jsonb),
         ('school_name', $1::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify('Escuela Técnica N° 35 D.E. 18 "Ing. Eduardo Latzina"')]
    );

    await client.query('COMMIT');

    console.log('\n✓ Datos de demostración listos. Nómina original restaurada.\n');
    console.log('  Cuentas demo:');
    for (const account of ACCOUNTS) {
      console.log(`   ${account.role.padEnd(14)} ${account.email.padEnd(25)} ${account.password}`);
    }
    console.log(`\n  Informes demo: #${[report1, report2, report3, report4, report5].join(', #')}`);
    console.log('  IMPORTANTE: cambie estas contraseñas antes de usar datos reales.\n');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
    await closePool();
  }
}

main().catch(error => {
  console.error('\n[db:seed]', error.message);
  process.exitCode = 1;
});
