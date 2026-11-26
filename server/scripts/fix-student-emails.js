import 'dotenv/config';
import { pool } from '../db.js';

const PROTECTED_COURSE_ID = 1;
const apply = process.argv.includes('--apply');

function slug(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.|\.$/g, '')
    .replace(/\.{2,}/g, '.');
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const studentsResult = await client.query(
      `SELECT s.id, s.first_name, s.last_name, s.email, s.course_id, c.year, c.division, c.specialty
         FROM students s
         JOIN courses c ON c.id = s.course_id
        WHERE s.course_id <> $1
        ORDER BY c.year, c.division, c.specialty, s.last_name, s.first_name`,
      [PROTECTED_COURSE_ID]
    );
    const usersResult = await client.query(
      'SELECT id, student_id, email FROM users WHERE email IS NOT NULL AND student_id IS NOT NULL'
    );

    const usedEmails = new Set(usersResult.rows.map(row => String(row.email).toLowerCase()));
    const plans = [];

    for (const student of studentsResult.rows) {
      const base = `${slug(student.first_name)}.${slug(student.last_name)}`;
      if (!base) continue;
      const desired = `${base}@latzina.edu.ar`;
      if (String(student.email || '').toLowerCase() === desired) continue;
      const user = usersResult.rows.find(row => Number(row.student_id) === Number(student.id));
      if (user?.email) usedEmails.delete(String(user.email).toLowerCase());
      if (student.email) usedEmails.delete(String(student.email).toLowerCase());
      plans.push({ student, user, desired, base });
    }

    if (!plans.length) {
      await client.query('ROLLBACK');
      console.log('Todos los correos de alumnos ya coinciden con su nombre. No hay cambios.');
      return;
    }

    for (const plan of plans) {
      let candidate = plan.desired;
      let suffix = 2;
      while (usedEmails.has(candidate.toLowerCase())) {
        candidate = `${plan.base}.${suffix++}@latzina.edu.ar`;
      }
      plan.finalEmail = candidate;
      usedEmails.add(candidate.toLowerCase());
    }

    console.log(`Correos a regularizar: ${plans.length}. Ejemplos:`);
    plans.slice(0, 8).forEach(plan => {
      console.log(`  ${plan.student.first_name} ${plan.student.last_name}: ${plan.student.email || '(sin correo)'} -> ${plan.finalEmail}`);
    });

    if (!apply) {
      await client.query('ROLLBACK');
      console.log('Modo simulación. Ejecute con --apply para guardar los cambios.');
      return;
    }

    // Primero liberamos los correos viejos para evitar colisiones transitorias.
    for (const plan of plans) {
      if (!plan.user) continue;
      const temp = `pendiente-${plan.student.id}-${Date.now()}@temporal.invalid`;
      await client.query('UPDATE users SET email = $1 WHERE id = $2', [temp, plan.user.id]);
    }

    for (const plan of plans) {
      const fullName = `${plan.student.first_name} ${plan.student.last_name}`.trim();
      await client.query('UPDATE students SET email = $1 WHERE id = $2', [plan.finalEmail, plan.student.id]);
      if (plan.user) {
        await client.query('UPDATE users SET email = $1, full_name = $2 WHERE id = $3', [plan.finalEmail, fullName, plan.user.id]);
      }
    }

    await client.query('COMMIT');
    console.log(`Correos actualizados: ${plans.length}.`);
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* noop */ }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(error => {
  console.error('No se pudieron regularizar los correos:', error);
  process.exitCode = 1;
});
