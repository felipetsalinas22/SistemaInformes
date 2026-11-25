#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
//  Seed institucional de prueba ADITIVO E IDEMPOTENTE.
//  - Nunca borra registros existentes salvo que se ejecute --reset.
//  - Cada inserción se protege por conflictos naturales (DNI, mail,
//    legajo vinculado) o por seed_registry (informes).
//  - Todas las cuentas nuevas usan la contraseña inicial "123".
//  Uso:
//    node server/scripts/seed.js            amplía la base actual
//    node server/scripts/seed.js --reset    reconstruye el conjunto de prueba completo
// ═══════════════════════════════════════════════════════════════════
import { pool, closePool } from '../db.js';
import { hashPassword } from '../lib/password.js';
import {
  notifyReportCreated, notifyStatementSubmitted, notifyDictamen
} from '../lib/notifications.js';
import { FIRST_NAMES, LAST_NAMES, nextGeneratedName, normalizeName } from '../lib/demo-names.js';

const RESET = process.argv.includes('--reset');
const FORCE = process.argv.includes('--force');
const INITIAL_PASSWORD = '123';

if (process.env.NODE_ENV === 'production' && !FORCE) {
  console.error('✗ No se ejecuta el seed en producción sin --force. Use server/scripts/create-admin.js.');
  process.exit(1);
}

// El colegio solamente ofrece Computación y Automotores como especialidades.
// 1.° a 3.° año son Ciclo Básico; la especialidad se cursa de 4.° a 6.°.
// Se conserva el orden histórico de los índices usados por docentes y cursos.
const COURSES = [
  { year: 6, division: 2, specialty: 'Computación', shift: 'Tarde' },
  { year: 1, division: 1, specialty: 'Ciclo Básico', shift: 'Mañana' },
  { year: 2, division: 1, specialty: 'Ciclo Básico', shift: 'Mañana' },
  { year: 2, division: 2, specialty: 'Ciclo Básico', shift: 'Tarde' },
  { year: 3, division: 1, specialty: 'Ciclo Básico', shift: 'Tarde' },
  { year: 4, division: 1, specialty: 'Computación', shift: 'Mañana' },
  { year: 5, division: 1, specialty: 'Automotores', shift: 'Tarde' },
  { year: 1, division: 2, specialty: 'Ciclo Básico', shift: 'Tarde' },
  { year: 1, division: 3, specialty: 'Ciclo Básico', shift: 'Mañana' },
  { year: 2, division: 3, specialty: 'Ciclo Básico', shift: 'Tarde' },
  { year: 3, division: 2, specialty: 'Ciclo Básico', shift: 'Mañana' },
  { year: 3, division: 3, specialty: 'Ciclo Básico', shift: 'Tarde' },
  { year: 4, division: 2, specialty: 'Automotores', shift: 'Mañana' },
  { year: 4, division: 3, specialty: 'Computación', shift: 'Tarde' },
  { year: 5, division: 2, specialty: 'Computación', shift: 'Mañana' },
  { year: 5, division: 3, specialty: 'Automotores', shift: 'Tarde' },
  { year: 6, division: 1, specialty: 'Computación', shift: 'Mañana' },
  { year: 6, division: 3, specialty: 'Automotores', shift: 'Tarde' }
];

// Nómina histórica restaurada del proyecto original (se mantiene en --reset).
const LEGACY_STUDENTS = [
  ['Agustina', 'Miranda'], ['Andacaba', 'Madai'], ['Angulo', 'Brunetti Alejo Nahuel'],
  ['Apicella', 'Nazareno'], ['Barreira', 'Joaquín'], ['Bartero', 'Lautaro'],
  ['Belay', 'Piedrabuena Martin'], ['Choquehuanca', 'Marco Antonio'], ['Crespo', 'Santino'],
  ['Dominguez', 'Gamarra Victoria Azul'], ['Enrique', 'Diaz Santino Adrian'],
  ['Escalante', 'Adrian'], ['Espinoza', 'Tiziano'], ['Estrada', 'Candiano Jeriel'],
  ['Galíndez', 'Sofía Emma'], ['Galván', 'Luana'], ['Goncalves', 'Guerreiro Luna Morena'],
  ['Guinsburg', 'Mateo'], ['Hung', 'Nicolás'], ['Iannopollo', 'Angeline'],
  ['Igarzabal', 'Felipe'], ['Manteiga', 'Agustín'], ['Marquez', 'Cristhian'],
  ['Mateo', 'Juárez Giliberti'], ['Mayz', 'Valeria'], ['Mihovilcevic', 'Mirko'],
  ['Miranda', 'Tobías Andres'], ['Morelli', 'Uziel'], ['Muzzi', 'Joaquín'],
  ['Navarro', 'Patricio'], ['Piñero', 'Natanael'], ['Portaluppi', 'Santino'],
  ['Kohler', 'Ramiro'], ['Rodrigues', 'Joaquín'], ['Rodriguez', 'Navarro Juan Alfonso'],
  ['Salinas', 'Felipe'], ['Seiberth', 'Valentin'], ['Siñani', 'Matias'],
  ['Valentin', 'Zamira'], ['Vivacqua', 'Antonella'], ['Yavi', 'Perez Kevin Lucas']
].map(([first, last], index) => ({ first, last, dni: String(46234001 + index), course: 0 }));

// Cuentas históricas: conservan sus contraseñas y pasan a correos institucionales.
const LEGACY_ACCOUNTS = [
  { key: 'admin', legacyEmail: 'admin@et35.demo', email: 'admin.institucional@latzina.edu.ar', password: 'Admin.2026!', name: 'Administrador institucional', role: 'ADMINISTRADOR' },
  { key: 'profesor', legacyEmail: 'profesor@et35.demo', email: 'profesor.institucional@latzina.edu.ar', password: 'Profesor.2026!', name: 'Docente institucional', role: 'PROFESOR', courses: [0] },
  { key: 'preceptor', legacyEmail: 'preceptor@et35.demo', email: 'preceptor.institucional@latzina.edu.ar', password: 'Preceptor.2026!', name: 'Preceptoría institucional', role: 'PRECEPTOR', courses: [0] },
  { key: 'pat', legacyEmail: 'pat@et35.demo', email: 'pat.institucional@latzina.edu.ar', password: 'Pat.2026!', name: 'Equipo PAT institucional', role: 'PROFESOR', courses: [0], patCourses: [0] },
  { key: 'regente', legacyEmail: 'regente@et35.demo', email: 'regente.institucional@latzina.edu.ar', password: 'Regente.2026!', name: 'Regencia institucional', role: 'REGENTE', scopeAll: true },
  { key: 'rector', legacyEmail: 'rector@et35.demo', email: 'rector.institucional@latzina.edu.ar', password: 'Rector.2026!', name: 'Rectorado institucional', role: 'RECTOR', scopeAll: true },
  { key: 'secretaria', legacyEmail: 'secretaria@et35.demo', email: 'secretaria.institucional@latzina.edu.ar', password: 'Secretaria.2026!', name: 'Secretaría institucional', role: 'SECRETARIA', scopeAll: true },
  { key: 'alumno', legacyEmail: 'alumno@et35.demo', email: 'alumno.institucional@latzina.edu.ar', password: 'Alumno.2026!', name: 'Guinsburg Mateo', role: 'ALUMNO', studentDni: '46234018' },
  { key: 'tutor', legacyEmail: 'tutor@et35.demo', email: 'familia.institucional@latzina.edu.ar', password: 'Tutor.2026!', name: 'Familia Guinsburg', role: 'TUTOR', tutorDnis: ['46234018'] }
];

// Cada docente se asigna como máximo a dos divisiones para que la misma
// persona no aparezca repetida en varias aperturas del sistema.
const TEACHERS = [
  { name: 'Laura Gómez', subject: 'Matemática', courses: [0, 8], pat: true },
  { name: 'Diego Fernández', subject: 'Lengua y Literatura', courses: [0, 7], pat: false },
  { name: 'Ana Martínez', subject: 'Física', courses: [4, 12], pat: false },
  { name: 'Sergio Ramírez', subject: 'Química', courses: [5, 13], pat: true },
  { name: 'Claudia Navarro', subject: 'Historia', courses: [1, 9], pat: false },
  { name: 'Martín López', subject: 'Geografía', courses: [2, 8], pat: false },
  { name: 'Paula Herrera', subject: 'Inglés', courses: [0, 3], pat: true },
  { name: 'Gabriel Torres', subject: 'Educación Física', courses: [7, 9], pat: false },
  { name: 'Natalia Acosta', subject: 'Computación', courses: [0, 16], pat: false },
  { name: 'Federico Sosa', subject: 'Automotores', courses: [6, 12], pat: true },
  { name: 'Valeria Díaz', subject: 'Automotores', courses: [6, 14], pat: false },
  { name: 'Hernán Vargas', subject: 'Taller de Proyecto', courses: [16, 17], pat: false },
  { name: 'Mariana Benítez', subject: 'Formación Ética', courses: [1, 2], pat: false },
  { name: 'Pablo Cabrera', subject: 'Arte y Diseño', courses: [8, 10], pat: false },
  { name: 'Silvia Pereyra', subject: 'Matemática', courses: [2, 9], pat: false },
  { name: 'Andrés Quiroga', subject: 'Lengua y Literatura', courses: [3, 12], pat: false },
  { name: 'Gisella Luna', subject: 'Inglés Técnico', courses: [5, 13], pat: false },
  { name: 'Marcelo Ortiz', subject: 'Física Aplicada', courses: [4, 14], pat: false },
  { name: 'Romina Flores', subject: 'Computación', courses: [7, 8], pat: false },
  { name: 'Emiliano Haedo', subject: 'Automotores', courses: [12, 15], pat: false },
  { name: 'Verónica Jiménez', subject: 'Historia Argentina', courses: [5, 6], pat: false },
  { name: 'Cristian Mendoza', subject: 'Deportes', courses: [0, 1], pat: false },
  { name: 'Jorgelina Paz', subject: 'Automotores', courses: [6, 15], pat: false },
  { name: 'Alejandro Bustos', subject: 'Formación Laboral', courses: [10, 11], pat: false }
];

const STAFF = [
  { email: 'rector@latzina.edu.ar', name: 'Rectorado ET35', role: 'RECTOR', scopeAll: true },
  { email: 'vicerrector@latzina.edu.ar', name: 'Vicerrectoría ET35', role: 'VICERRECTOR', scopeAll: true },
  { email: 'regente@latzina.edu.ar', name: 'Regencia ET35', role: 'REGENTE', scopeAll: true },
  { email: 'subregente@latzina.edu.ar', name: 'Subregencia ET35', role: 'SUBREGENTE', scopeAll: true },
  { email: 'jefetaller@latzina.edu.ar', name: 'Jefatura de Taller', role: 'JEFE_TALLER', scopeAll: true },
  { email: 'gerente@latzina.edu.ar', name: 'Gerencia institucional', role: 'GERENTE', scopeAll: true },
  { email: 'preceptoria@latzina.edu.ar', name: 'Preceptoría ET35', role: 'PRECEPTOR', courses: [0, 7, 8, 9, 10, 11] },
  { email: 'secretaria@latzina.edu.ar', name: 'Secretaría ET35', role: 'SECRETARIA', scopeAll: true },
  { email: 'orientacion@latzina.edu.ar', name: 'Orientación y Bienestar (DOE)', role: 'DOE', courses: [0, 3, 4, 12, 16] },
  { email: 'admin@latzina.edu.ar', name: 'Administrador', role: 'ADMINISTRADOR' }
];

const REASONS = [
  'Interrupción reiterada durante la clase',
  'Uso de dispositivo móvil en horario de taller',
  'Llegada tardía sin justificación',
  'Falta de respeto hacia un compañero',
  'No entrega de trabajo práctico',
  'Daño a materiales del taller',
  'Abandono del aula sin autorización',
  'Ruido y disturbios en el aula',
  'Negativa a cumplir una consigna de seguridad',
  'Conflicto entre compañeros en el recreo'
];

const DESCRIPTIONS = [
  'Se registró la situación durante la jornada escolar y se dio intervención inmediata a preceptoría. Los hechos se describen sin incluir datos sensibles ajenos al procedimiento.',
  'El hecho se observó en dos oportunidades dentro de la misma semana. Se conversó con el alumno y se labró el registro correspondiente según el protocolo institucional.',
  'Se solicitó por escrito la justificación correspondiente y no se recibió respuesta dentro del plazo informado. Se notificó a la familia por los canales habituales.',
  'La situación fue presenciada por el docente a cargo y por otros compañeros. Se priorizó el resguardo del clima de convivencia y se derivó el caso a orientación.',
  'Si bien se realizó la advertencia previa, no se presentó la actividad en la fecha acordada. Se dejó constancia en el legajo de seguimiento.'
];

const SIGNATURE_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function slug(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ')
    .trim().replace(/\s+/g, '.');
}

function daysFromNow(days) {
  const date = new Date(Date.now() + days * 86400000);
  date.setHours(23, 59, 0, 0);
  return date.toISOString();
}

function daysAgo(days) {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (RESET) {
      await client.query(`
        TRUNCATE report_history, notifications, audit_log, sessions, reports,
                 pat_assignments, tutor_students, user_courses, users, students,
                 courses, seed_registry
        RESTART IDENTITY CASCADE
      `);
      console.log('• Datos anteriores eliminados (--reset).');
    }

    const roleRows = await client.query('SELECT id, code FROM roles');
    const roleIds = Object.fromEntries(roleRows.rows.map(row => [row.code, row.id]));
    if (!roleIds.PROFESOR || !roleIds.ADMINISTRADOR) {
      throw new Error('Faltan roles base. Ejecute primero npm run db:migrate.');
    }

    // ── Cursos ────────────────────────────────────────────────────
    const courseIds = [];
    for (const course of COURSES) {
      const result = await client.query(
        `INSERT INTO courses (year, division, specialty, shift) VALUES ($1, $2, $3, $4)
         ON CONFLICT (year, division, specialty)
         DO UPDATE SET shift = EXCLUDED.shift, is_active = TRUE
         RETURNING id`,
        [course.year, course.division, course.specialty, course.shift]
      );
      courseIds.push(result.rows[0].id);
    }
    console.log(`• Cursos disponibles: ${courseIds.length} (1.° a 6.°, divisiones 1.° a 3.°).`);

    // ── Alumnos ───────────────────────────────────────────────────
    const existingStudents = await client.query('SELECT id, dni, first_name, last_name, course_id, email FROM students');
    const dniSet = new Set(existingStudents.rows.map(row => row.dni));
    const usedEmails = new Set();
    // La nómina de 6.° 2.° Computación es histórica: se conserva y sus nombres
    // se reservan para que ninguna otra división repita una persona.
    const reservedNames = new Set(
      existingStudents.rows.map(row => normalizeName(`${row.first_name} ${row.last_name}`))
    );
    let nameCursor = 0;

    async function ensureStudent(first, last, dni, courseIndex, birth) {
      const base = `${slug(first)}.${slug(String(last).split(' ')[0])}`;
      let email = `${base}@latzina.edu.ar`;
      let suffix = 2;
      while (usedEmails.has(email.toLowerCase())) {
        email = `${base}.${suffix}@latzina.edu.ar`;
        suffix += 1;
      }
      usedEmails.add(email.toLowerCase());
      const guardian = `familia.${slug(String(last).split(' ')[0])}@latzina.edu.ar`;

      const result = await client.query(
        `INSERT INTO students (first_name, last_name, dni, legajo, course_id, email, guardian_email, birth_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (dni) DO UPDATE
           SET course_id = COALESCE(students.course_id, EXCLUDED.course_id),
               email = CASE WHEN students.email IS NULL OR students.email NOT LIKE '%@latzina.edu.ar%'
                            THEN EXCLUDED.email ELSE students.email END,
               guardian_email = COALESCE(students.guardian_email, EXCLUDED.guardian_email)
         RETURNING id, first_name, last_name, dni, course_id, email`,
        [first, last, dni, `LEG-${dni}`, courseIds[courseIndex], email, guardian, birth || null]
      );
      const row = result.rows[0];
      usedEmails.add(row.email.toLowerCase());
      reservedNames.add(normalizeName(`${row.first_name} ${row.last_name}`));
      return row;
    }

    if (RESET) {
      for (const student of LEGACY_STUDENTS) {
        await ensureStudent(student.first, student.last, student.dni, student.course);
      }
    }

    // Nómina ampliada: 5 alumnos por división, con nombres completos únicos.
    // El índice 0 (6.° 2.°) conserva la nómina histórica sin modificaciones.
    const targetCourses = COURSES.map((_, index) => index);
    let addedStudents = 0;
    for (let index = 0; index < 95; index += 1) {
      const dni = String(46234042 + index);
      // Si el legajo ya existe, se omite: el seed es aditivo, no duplica.
      if (dniSet.has(dni)) continue;
      dniSet.add(dni);
      const generated = nextGeneratedName(nameCursor, reservedNames);
      nameCursor = generated.cursor;
      const courseIndex = targetCourses[index % targetCourses.length];
      await ensureStudent(generated.first, generated.last, dni, courseIndex, `2010-${String((index % 12) + 1).padStart(2, '0')}-15`);
      addedStudents += 1;
    }

    const studentRows = (await client.query(
      `SELECT s.id, s.first_name, s.last_name, s.dni, s.course_id, s.email, s.legajo,
              s.guardian_email, c.year, c.division, c.specialty, c.shift
       FROM students s JOIN courses c ON c.id = s.course_id ORDER BY s.id`
    )).rows;
    const findCourseIndex = (student) => {
      const exact = COURSES.findIndex(c => c.year === student.year && c.division === student.division && c.specialty === student.specialty);
      return exact >= 0 ? exact : COURSES.findIndex(c => c.year === student.year && c.division === student.division);
    };
    const studentByDni = new Map(studentRows.map(row => [row.dni, row]));
    const studentsByCourse = new Map();
    for (const row of studentRows) {
      if (!studentsByCourse.has(row.course_id)) studentsByCourse.set(row.course_id, []);
      studentsByCourse.get(row.course_id).push(row);
    }
    console.log(`• Alumnos totals: ${studentRows.length} (${addedStudents} nuevos en esta ejecución).`);

    // ── Cuentas ───────────────────────────────────────────────────
    const userIds = {};

    async function ensureUser({ email, password, name, roleCode, studentId = null, scopeAll = false, mustChange = false }) {
      const found = await client.query('SELECT id FROM users WHERE lower(email) = lower($1)', [email]);
      if (found.rows[0]) {
        userIds[email] = found.rows[0].id;
        return found.rows[0].id;
      }
      const hash = await hashPassword(password);
      const inserted = await client.query(
        `INSERT INTO users (email, password_hash, full_name, role_id, student_id, scope_all,
                            is_active, must_change_password, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7, NULL)
         RETURNING id`,
        [email, hash, name, roleIds[roleCode], studentId, Boolean(scopeAll), Boolean(mustChange)]
      );
      userIds[email] = inserted.rows[0].id;
      return inserted.rows[0].id;
    }

    async function setCourses(userId, courseIndexes) {
      for (const index of courseIndexes || []) {
        await client.query(
          'INSERT INTO user_courses (user_id, course_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [userId, courseIds[index]]
        );
      }
    }

    async function setPatCourses(userId, courseIndexes) {
      for (const index of courseIndexes || []) {
        await client.query(
          'INSERT INTO pat_assignments (user_id, course_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [userId, courseIds[index]]
        );
      }
    }

    // Las cuentas históricas migran a correos institucionales sin perder su hash.
    for (const account of LEGACY_ACCOUNTS) {
      const oldUser = await client.query('SELECT id FROM users WHERE lower(email) = lower($1)', [account.legacyEmail]);
      const targetUser = await client.query('SELECT id FROM users WHERE lower(email) = lower($1)', [account.email]);
      if (oldUser.rows[0] && !targetUser.rows[0]) {
        await client.query(
          'UPDATE users SET email = $1, full_name = $2, updated_at = now() WHERE id = $3',
          [account.email, account.name, oldUser.rows[0].id]
        );
        await client.query(
          'UPDATE reports SET issuer_email = $1 WHERE lower(issuer_email) = lower($2)',
          [account.email, account.legacyEmail]
        );
      }
    }

    for (const account of LEGACY_ACCOUNTS) {
      const student = account.studentDni ? studentByDni.get(account.studentDni) : null;
      const id = await ensureUser({
        email: account.email, password: account.password, name: account.name,
        roleCode: account.role, studentId: student?.id || null, scopeAll: Boolean(account.scopeAll)
      });
      await setCourses(id, account.courses);
      await setPatCourses(id, account.patCourses);
      for (const dni of account.tutorDnis || []) {
        const tutored = studentByDni.get(dni);
        if (tutored) {
          await client.query(
            'INSERT INTO tutor_students (tutor_user_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [id, tutored.id]
          );
        }
      }
    }

    for (const member of STAFF) {
      const id = await ensureUser({
        email: member.email, password: INITIAL_PASSWORD, name: member.name,
        roleCode: member.role, scopeAll: Boolean(member.scopeAll), mustChange: true
      });
      await setCourses(id, member.courses);
    }

    const teacherUsers = [];
    for (const teacher of TEACHERS) {
      const email = `prof.${slug(teacher.name)}@latzina.edu.ar`;
      const id = await ensureUser({
        email, password: INITIAL_PASSWORD, name: `${teacher.name} · ${teacher.subject}`,
        roleCode: 'PROFESOR', mustChange: true
      });
      await setCourses(id, teacher.courses);
      if (teacher.pat) await setPatCourses(id, teacher.courses.slice(0, 1));
      teacherUsers.push({ ...teacher, id, email });
    }

    // Cuenta de alumno por legajo (la única cuenta histórica ya vinculada se respeta).
    let studentAccounts = 0;
    for (const row of studentRows) {
      const linked = await client.query('SELECT id FROM users WHERE student_id = $1', [row.id]);
      if (linked.rows[0]) continue;
      const email = row.email || `${slug(row.first_name)}.${slug(row.last_name)}@latzina.edu.ar`;
      await ensureUser({
        email, password: INITIAL_PASSWORD,
        name: `${row.first_name} ${row.last_name}`.trim(),
        roleCode: 'ALUMNO', studentId: row.id, mustChange: true
      });
      studentAccounts += 1;
    }

    // Familias de ejemplo, cada una con varios alumnos a cargo.
    let tutorAccounts = 0;
    for (let index = 0; index < 12; index += 1) {
      const email = `familia.${index + 1}@latzina.edu.ar`;
      const firstName = FIRST_NAMES[(index * 3 + 1) % FIRST_NAMES.length];
      const lastName = LAST_NAMES[(index * 5 + 2) % LAST_NAMES.length];
      const id = await ensureUser({
        email, password: INITIAL_PASSWORD,
        name: `${firstName} ${lastName} (familia)`, roleCode: 'TUTOR', mustChange: true
      });
      const assigned = studentRows.slice(index * 6, index * 6 + 2);
      for (const student of assigned) {
        await client.query(
          'INSERT INTO tutor_students (tutor_user_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [id, student.id]
        );
      }
      tutorAccounts += 1;
    }

    // Familias reales de la nómina: se habilita el correo del tutor (gmail u
    // otro proveedor) como usuario TUTOR vinculado a sus alumnos.
    let familyAccounts = 0;
    const familyGroups = new Map();
    for (const student of studentRows) {
      const email = String(student.guardian_email || '').trim().toLowerCase();
      if (!email || email.endsWith('@latzina.edu.ar')) continue;
      if (!familyGroups.has(email)) {
        familyGroups.set(email, { lastName: student.last_name, students: [] });
      }
      familyGroups.get(email).students.push(student.id);
    }
    for (const [email, family] of familyGroups) {
      const id = await ensureUser({
        email, password: INITIAL_PASSWORD,
        name: `Familia ${family.lastName}`, roleCode: 'TUTOR', mustChange: true
      });
      for (const studentId of family.students) {
        await client.query(
          'INSERT INTO tutor_students (tutor_user_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [id, studentId]
        );
      }
      familyAccounts += 1;
    }
    tutorAccounts += familyAccounts;
    console.log(`• Cuentas: ${teacherUsers.length} docentes, ${studentAccounts} alumnos, ${tutorAccounts} tutores, ${STAFF.length} personal.`);
    console.log('• Cuenta administrativa de exposición: admin@latzina.edu.ar / 123 (rol Administrador).');
    console.log('• Tutores con correo familiar (ej.: tutor_guinsburg@gmail.com / 123) también pueden iniciar sesión.');

    // ── Informes institucionales de prueba ──────────────────────────────────
    const adminId = userIds['admin@latzina.edu.ar'];
    const rectorId = userIds['regente@latzina.edu.ar'] || adminId;
    const actor = {
      id: adminId,
      full_name: 'Administrador',
      role_name: 'ADMINISTRADOR',
      email: 'admin@latzina.edu.ar'
    };
    const authority = { ...actor, id: rectorId, full_name: 'Regencia ET35', role_name: 'REGENTE' };

    // Las claves de registry históricas pasan a nombres institucionales.
    await client.query(`
      UPDATE seed_registry
         SET key = 'institutional-report-' || substring(key from 13)
       WHERE key LIKE 'demo-report-%'
         AND NOT EXISTS (
           SELECT 1 FROM seed_registry s2
            WHERE s2.key = 'institutional-report-' || substring(seed_registry.key from 13)
         )
    `);

    let createdReports = 0;
    for (let index = 0; index < 48; index += 1) {
      const key = `institutional-report-${index + 1}`;
      const already = await client.query('SELECT 1 FROM seed_registry WHERE key = $1', [key]);
      if (already.rows[0]) continue;

      const student = studentRows[(index * 7 + 3) % studentRows.length];
      const teachers = teacherUsers.filter(teacher => teacher.courses.includes(
        findCourseIndex(student)
      ));
      const creator = teachers[index % Math.max(1, teachers.length)] || teacherUsers[index % teacherUsers.length];
      const issueDaysAgo = (index % 18) + 1;
      const pattern = index % 6;

      let stage = 'descargo';
      let status = 'Pendiente';
      let studentText = '';
      let submittedAt = null;
      let deadlineOffset = index % 3 === 0 ? -2 : (index % 3 === 1 ? 1 : 6);
      let severity = ['LEVE', 'GRAVE', 'MUY GRAVE'][index % 3];
      let directorDate = null;
      let signature = 'No Firmado';
      let notifyStudent = false;
      let notifyParent = false;

      if (pattern === 1 || pattern === 2) {
        studentText = `Descargo del alumno/a. Se reconoce el hecho y se explica la circunstancia. Caso de prueba N° ${index + 1}.`;
        submittedAt = new Date(Date.now() - (issueDaysAgo - 1) * 86400000).toISOString();
        stage = 'consejos';
      }
      if (pattern === 2) {
        stage = 'dictamen';
      }
      if (pattern === 3) {
        studentText = `Descargo presentado fuera de la etapa inicial (caso institucional N° ${index + 1}).`;
        submittedAt = new Date(Date.now() - 86400000).toISOString();
        stage = 'notificado';
        status = 'Resuelto';
        directorDate = daysAgo(1);
        signature = 'FIRMADO_AUTORIDAD_INSTITUCIONAL';
        severity = 'GRAVE';
        notifyStudent = true;
        notifyParent = true;
      }
      if (pattern === 4) {
        status = 'Anulado';
        deadlineOffset = -10;
      }

      const reason = `${REASONS[index % REASONS.length]}`;
      const description = `${DESCRIPTIONS[index % DESCRIPTIONS.length]} Registro institucional N° ${index + 1}.`;
      const deadline = daysFromNow(deadlineOffset);
      const courseIndex = findCourseIndex(student);
      const course = COURSES[courseIndex] || COURSES[0];

      const inserted = await client.query(
        `INSERT INTO reports
          (student_id, created_by, issuer_name, issuer_role, issuer_email, issue_date,
           reason, description, student_text, statement_submitted_at, statement_deadline,
           preceptor_notes, pat_notes, council_notes, additional_notes, severity,
           other_considerations, director_signature, director_signature_image, director_date,
           director_user_id, notify_student, notify_parent, status, stage, previous_status,
           student_course_id, student_first_name, student_last_name, student_name,
           student_dni, student_year, student_division, student_specialty, student_shift,
           student_legajo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
                 $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36)
         RETURNING id`,
        [
          student.id, creator.id, creator.name, 'Profesor/a', creator.email,
          daysAgo(issueDaysAgo), reason, description, studentText, submittedAt, deadline,
          pattern >= 2 ? 'Se conversó con el alumno y se registró el seguimiento correspondiente.' : '',
          pattern >= 2 ? 'Seguimiento orientativo sin medidas disciplinarias adicionales.' : '',
          pattern >= 2 ? 'El Consejo de Convivencia evaluó el caso y sugirió una medida pedagógica.' : '',
          pattern >= 3 ? 'Se informó a la familia por canales institucionales.' : '',
          severity,
          pattern >= 3 ? 'Refuerzo de normas de convivencia y seguimiento quincenal.' : '',
          signature, pattern === 3 ? SIGNATURE_PNG : null, directorDate,
          pattern === 3 ? authority.id : null,
          notifyStudent, notifyParent, status, stage,
          status === 'Anulado' ? 'Pendiente' : null,
          student.course_id, student.first_name, student.last_name,
          `${student.first_name} ${student.last_name}`.trim(), student.dni,
          student.year, student.division, student.specialty, student.shift, student.legajo
        ]
      );

      const reportId = inserted.rows[0].id;
      const reportLike = {
        id: reportId, student_id: student.id, course_id: student.course_id,
        created_by: creator.id, severity, status, stage, statement_deadline: deadline
      };
      await client.query(
        `INSERT INTO report_history (report_id, action, actor_user_id, actor_name, actor_role, description, created_at)
         VALUES ($1,$2,$3,$4,$5,$6, now() - ($7::int * interval '1 day'))`,
        [reportId, 'CREACIÓN', creator.id, creator.name, 'PROFESOR', `Informe creado. Motivo: ${reason}`, issueDaysAgo]
      );
      await notifyReportCreated(client, reportLike, actor);
      if (submittedAt) await notifyStatementSubmitted(client, reportLike, actor);
      if (status === 'Resuelto') {
        await notifyDictamen(client, reportLike, authority, { notifyStudent, notifyParent });
      }
      await client.query('INSERT INTO seed_registry (key) VALUES ($1)', [key]);
      createdReports += 1;
    }

    await client.query(
      `INSERT INTO settings (key, value) VALUES
         ('statement_days', '5'::jsonb),
         ('school_name', $1::jsonb)
       ON CONFLICT (key) DO NOTHING`,
      [JSON.stringify('Escuela Técnica N° 35 D.E. 18 "Ing. Eduardo Latzina"')]
    );

    await client.query('COMMIT');
    console.log(`• Informes institucionales creados ahora: ${createdReports}.`);
    console.log('\n✓ Seed finalizado sin borrar datos existentes.\n');
    console.log('  Credenciales iniciales (contraseña inicial 123):');
    console.log('   admin@latzina.edu.ar      Administrador');
    console.log('   gerente@latzina.edu.ar    Gerente (gestiona usuarios y PAT)');
    console.log('   rector@latzina.edu.ar     Rector/a');
    console.log('   regente@latzina.edu.ar    Regente (autoridad firmante)');
    console.log('   preceptoria@latzina.edu.ar Preceptoría');
    console.log('   prof.<nombre>@latzina.edu.ar  Docentes (algunos con función PAT)');
    console.log('   <nombre.apellido>@latzina.edu.ar  Alumnos');
    console.log('   familia.N@latzina.edu.ar  Familias/tutores');
    console.log('  Las cuentas institucionales conservan sus contraseñas originales.\n');
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
