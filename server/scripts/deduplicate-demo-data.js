#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
//  Regularización NO destructiva de los datos de demostración.
//  - Conserva tal cual la nómina de 6.° 2.° Computación.
//  - Renombra alumnos repetidos en otras divisiones.
//  - Limita a dos divisiones por docente y a una la función PAT.
//  No elimina informes, notificaciones ni cuentas.
//  Uso: node server/scripts/deduplicate-demo-data.js
// ═══════════════════════════════════════════════════════════════════
import { pool, closePool } from '../db.js';
import { nextGeneratedName, normalizeName } from '../lib/demo-names.js';

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

    const students = await client.query(`
      SELECT id, first_name, last_name, course_id
        FROM students ORDER BY id
    `);

    const groups = new Map();
    for (const row of students.rows) {
      const key = normalizeName(`${row.first_name} ${row.last_name}`);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }

    const reservedNames = new Set(groups.keys());
    const toRename = [];
    for (const rows of groups.values()) {
      if (rows.length < 2) continue;
      // Si el nombre aparece en la división protegida, esa es la referencia.
      const canonical = rows.find(row => row.course_id === protectedId) || rows[0];
      for (const row of rows) {
        if (row.id !== canonical.id && row.course_id !== protectedId) toRename.push(row);
      }
    }

    let cursor = 0;
    let renamed = 0;
    for (const row of toRename) {
      const generated = nextGeneratedName(cursor, reservedNames);
      cursor = generated.cursor;
      const fullName = `${generated.first} ${generated.last}`.trim();
      await client.query(
        'UPDATE students SET first_name = $1, last_name = $2 WHERE id = $3',
        [generated.first, generated.last, row.id]
      );
      await client.query(
        'UPDATE users SET full_name = $1 WHERE student_id = $2',
        [fullName, row.id]
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
    console.log(`• Alumnos renombrados: ${renamed}. Nómina de 6.° 2.° Computación intacta.`);
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
