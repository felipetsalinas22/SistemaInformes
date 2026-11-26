#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
//  Regularización NO destructiva de los datos de demostración.
//  - Conserva tal cual la nómina de 6.° 2.° Computación.
//  - Renombra el resto con nombres y apellidos argentinos variados.
//  - Completa 20 alumnos por división (salvo la división protegida).
//  - Limita a dos divisiones por docente y a una la función PAT.
//  No elimina informes, notificaciones ni cuentas.
//  Uso: node server/scripts/deduplicate-demo-data.js
// ═══════════════════════════════════════════════════════════════════
import { pool, closePool } from '../db.js';
import { hashPassword } from '../lib/password.js';
import { nextGeneratedName, normalizeName } from '../lib/demo-names.js';

const TARGET_PER_COURSE = 20;
const INITIAL_PASSWORD = '123';

function slug(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ')
    .trim().replace(/\s+/g, '.');
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const protectedCourse = await client.query(`
      SELECT id FROM courses
       WHERE year = 6 AND division = 2 AND specialty = 'Computación'
       LIMIT 1
    `);
    const protectedId = protectedCourse.rows[0]?.id ?? null;

    const studentsResult = await client.query(`
      SELECT id, first_name, last_name, dni, course_id, email
        FROM students ORDER BY id
    `);
    const students = studentsResult.rows;
    const dniSet = new Set(students.map(row => String(row.dni)));
    const reservedNames = new Set(
      students.map(row => normalizeName(`${row.first_name} ${row.last_name}`))
    );
    const userEmails = await client.query(
      'SELECT lower(email) AS email FROM users WHERE email IS NOT NULL AND student_id IS NOT NULL'
    );
    const usedEmails = new Set([
      ...students.map(row => String(row.email || '').toLowerCase()).filter(Boolean),
      ...userEmails.rows.map(row => row.email)
    ]);

    let cursor = 0;
    let renamed = 0;
    for (const row of students) {
      if (row.course_id === protectedId) continue;
      const generated = nextGeneratedName(cursor, reservedNames);
      cursor = generated.cursor;
      const fullName = `${generated.first} ${generated.last}`.trim();
      const oldEmail = String(row.email || '').toLowerCase();
      if (oldEmail) usedEmails.delete(oldEmail);
      const emailBase = `${slug(generated.first)}.${slug(generated.last)}`;
      let email = `${emailBase}@latzina.edu.ar`;
      let suffix = 2;
      while (usedEmails.has(email.toLowerCase())) {
        email = `${emailBase}.${suffix++}@latzina.edu.ar`;
      }
      usedEmails.add(email.toLowerCase());
      await client.query(
        'UPDATE students SET first_name = $1, last_name = $2, email = $3, updated_at = now() WHERE id = $4',
        [generated.first, generated.last, email, row.id]
      );
      await client.query(
        'UPDATE users SET full_name = $1, email = $2, updated_at = now() WHERE student_id = $3',
        [fullName, email, row.id]
      );
      await client.query(
        `UPDATE reports
            SET student_first_name = $1, student_last_name = $2,
                student_name = $3
          WHERE student_id = $4`,
        [generated.first, generated.last, fullName, row.id]
      );
      renamed += 1;
    }

    // ── Completar 20 alumnos por división (excepto la protegida) ────
    const courses = await client.query(`
      SELECT id, year FROM courses ORDER BY year, division
    `);
    const emailRows = await client.query(`
      SELECT lower(email) AS email FROM students WHERE email IS NOT NULL
    `);
    const usedNewEmails = new Set(emailRows.rows.map(row => row.email));
    const roleRows = await client.query('SELECT id, code FROM roles');
    const roleIds = Object.fromEntries(roleRows.rows.map(row => [row.code, row.id]));
    if (!roleIds.ALUMNO) throw new Error('Falta el rol ALUMNO en la base de datos.');
    const passwordHash = await hashPassword(INITIAL_PASSWORD);

    let nextDni = Math.max(46234042, ...students.map(row => Number(row.dni) || 0)) + 1;
    let added = 0;
    for (const course of courses.rows) {
      if (course.id === protectedId) continue;
      const inCourse = await client.query(
        'SELECT id FROM students WHERE course_id = $1 ORDER BY id',
        [course.id]
      );
      const missing = TARGET_PER_COURSE - inCourse.rows.length;
      if (missing <= 0) continue;

      for (let n = 0; n < missing; n += 1) {
        const generated = nextGeneratedName(cursor, reservedNames);
        cursor = generated.cursor;
        const fullName = `${generated.first} ${generated.last}`.trim();
        let dni = String(nextDni++);
        while (dniSet.has(dni)) dni = String(nextDni++);
        dniSet.add(dni);

        const base = `${slug(generated.first)}.${slug(generated.last)}`;
        let email = `${base}@latzina.edu.ar`;
        let suffix = 2;
        while (usedNewEmails.has(email.toLowerCase())) {
          email = `${base}.${suffix}@latzina.edu.ar`;
          suffix += 1;
        }
        usedNewEmails.add(email.toLowerCase());

        const guardian = `familia.${slug(generated.last)}@latzina.edu.ar`;
        const birthYear = 2010 - (6 - course.year);
        const birth = `${birthYear}-${String((n % 12) + 1).padStart(2, '0')}-15`;
        const inserted = await client.query(
          `INSERT INTO students
                  (first_name, last_name, dni, legajo, course_id, email, guardian_email, birth_date)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id`,
          [generated.first, generated.last, dni, `LEG-${dni}`, course.id, email, guardian, birth]
        );
        await client.query(
          `INSERT INTO users
                  (email, password_hash, full_name, role_id, student_id, must_change_password)
           VALUES ($1, $2, $3, $4, $5, TRUE)
           ON CONFLICT (lower(email)) DO NOTHING`,
          [email, passwordHash, fullName, roleIds.ALUMNO, inserted.rows[0].id]
        );
        added += 1;
      }
    }

    // Un docente asignado a demasiadas divisiones hace que su nombre aparezca
    // repetido en varias aperturas. Se conservan las dos primeras.
    const courseLinks = await client.query(`
      DELETE FROM user_courses uc
       USING users u JOIN roles r ON r.id = u.role_id
       WHERE uc.user_id = u.id
         AND r.code = 'PROFESOR'
         AND uc.course_id NOT IN (
           SELECT course_id FROM user_courses own
            WHERE own.user_id = u.id ORDER BY course_id LIMIT 2
         )
    `);
    const patLinks = await client.query(`
      DELETE FROM pat_assignments pa
       USING users u JOIN roles r ON r.id = u.role_id
       WHERE pa.user_id = u.id
         AND r.code = 'PROFESOR'
         AND pa.course_id NOT IN (
           SELECT course_id FROM pat_assignments own
            WHERE own.user_id = u.id ORDER BY course_id LIMIT 1
         )
    `);

    await client.query('COMMIT');
    console.log(`• Alumnos renombrados: ${renamed}. Nuevos alumnos: ${added}.`);
    console.log('• Nómina de 6.° 2.° Computación intacta; resto con 20 alumnos por división.');
    console.log(`• Asignaciones docentes reducidas: ${courseLinks.rowCount} cursos y ${patLinks.rowCount} PAT.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

main()
  .then(() => closePool())
  .catch(error => {
    console.error('✗ No se pudo regularizar los datos de demostración:', error);
    process.exitCode = 1;
  });
