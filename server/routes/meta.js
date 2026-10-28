import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../auth.js';
import { asyncHandler } from '../lib/http.js';
import { isAdmin, isDirectivo, isReadonly, isStudent, isTutor } from '../permissions.js';

const router = Router();

router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const user = req.user;
  const roles = await query(
    'SELECT id, code, name, description, sort_order FROM roles ORDER BY sort_order, name'
  );

  let courseRows;
  if (isAdmin(user) || ((isDirectivo(user) || isReadonly(user)) && user.scope_all)) {
    courseRows = await query(
      'SELECT id, year, division, specialty, shift FROM courses WHERE is_active = TRUE ORDER BY year, division, specialty'
    );
  } else if (isStudent(user)) {
    courseRows = await query(
      `SELECT c.id, c.year, c.division, c.specialty, c.shift
       FROM courses c JOIN students s ON s.course_id = c.id WHERE s.id = $1`,
      [user.student_id]
    );
  } else if (isTutor(user)) {
    courseRows = await query(
      `SELECT DISTINCT c.id, c.year, c.division, c.specialty, c.shift
       FROM courses c
       JOIN students s ON s.course_id = c.id
       JOIN tutor_students ts ON ts.student_id = s.id
       WHERE ts.tutor_user_id = $1`,
      [user.id]
    );
  } else {
    courseRows = await query(
      `SELECT id, year, division, specialty, shift FROM courses
       WHERE id = ANY($1::int[]) AND is_active = TRUE ORDER BY year, division, specialty`,
      [(user.course_ids || []).map(Number).filter(Boolean)]
    );
  }

  const settings = await query(`SELECT key, value FROM settings WHERE key IN ('statement_days', 'school_name')`);
  const settingsMap = Object.fromEntries(settings.rows.map(row => [row.key, row.value]));

  res.json({
    roles: roles.rows.map(row => ({
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      sortOrder: row.sort_order
    })),
    courses: courseRows.rows.map(row => ({
      id: row.id,
      year: Number(row.year),
      division: Number(row.division),
      specialty: row.specialty,
      shift: row.shift,
      label: `${row.year}° ${row.division}° ${row.specialty}`
    })),
    settings: {
      statementDays: Number(settingsMap.statement_days) || 5,
      schoolName: settingsMap.school_name || 'Escuela Técnica N° 35 D.E. 18'
    },
    today: new Date().toISOString().slice(0, 10)
  });
}));

export default router;
