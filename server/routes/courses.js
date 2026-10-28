import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { requireAuth, requireCsrf } from '../auth.js';
import { ApiError, asyncHandler, parseId } from '../lib/http.js';
import { parseBody } from '../lib/validate.js';
import { writeAudit } from '../lib/audit.js';
import { canManageCourses, isStudent, isTutor, isAdmin, isDirectivo, isReadonly } from '../permissions.js';

const router = Router();

function accessibleCourseIds(user) {
  if (isAdmin(user) || ((isDirectivo(user) || isReadonly(user)) && user.scope_all)) return null; // todos
  if (isStudent(user) || isTutor(user)) return null; // se resuelven por alumno vinculado
  return (user.course_ids || []).map(Number).filter(Boolean);
}

router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const user = req.user;
  let result;

  if (isAdmin(user) || ((isDirectivo(user) || isReadonly(user)) && user.scope_all)) {
    result = await query(
      `SELECT id, year, division, specialty, shift, is_active
       FROM courses ORDER BY is_active DESC, year, division, specialty`
    );
  } else if (isStudent(user)) {
    result = await query(
      `SELECT c.id, c.year, c.division, c.specialty, c.shift, c.is_active
       FROM courses c JOIN students s ON s.course_id = c.id
       WHERE s.id = $1`,
      [user.student_id]
    );
  } else if (isTutor(user)) {
    result = await query(
      `SELECT DISTINCT c.id, c.year, c.division, c.specialty, c.shift, c.is_active
       FROM courses c
       JOIN students s ON s.course_id = c.id
       JOIN tutor_students ts ON ts.student_id = s.id
       WHERE ts.tutor_user_id = $1`,
      [user.id]
    );
  } else {
    const ids = accessibleCourseIds(user) || [];
    result = await query(
      `SELECT id, year, division, specialty, shift, is_active
       FROM courses WHERE id = ANY($1::int[]) ORDER BY year, division, specialty`,
      [ids]
    );
  }

  res.json({
    courses: result.rows.map(row => ({
      id: row.id,
      year: Number(row.year),
      division: Number(row.division),
      specialty: row.specialty,
      shift: row.shift,
      label: `${row.year}° ${row.division}° ${row.specialty}`,
      isActive: Boolean(row.is_active)
    }))
  });
}));

const courseSchema = z.object({
  year: z.coerce.number().int().min(1).max(6),
  division: z.coerce.number().int().min(1).max(12),
  specialty: z.string().trim().min(2).max(80),
  shift: z.string().trim().min(2).max(40).optional().default('Mañana')
}).strict();

router.post('/', requireAuth, requireCsrf, asyncHandler(async (req, res) => {
  if (!canManageCourses(req.user)) throw ApiError.forbidden('Sólo un administrador puede crear cursos.');
  const data = parseBody(courseSchema, req.body);
  try {
    const result = await query(
      `INSERT INTO courses (year, division, specialty, shift) VALUES ($1, $2, $3, $4) RETURNING id`,
      [data.year, data.division, data.specialty, data.shift]
    );
    await writeAudit({
      actor: req.user, action: 'ALTA_CURSO', entity: 'course', entityId: result.rows[0].id,
      detail: data, ip: req.ip
    });
    res.status(201).json({ id: result.rows[0].id });
  } catch (error) {
    if (error.code === '23505') throw ApiError.conflict('Ese curso y división ya existen.');
    throw error;
  }
}));

router.patch('/:id', requireAuth, requireCsrf, asyncHandler(async (req, res) => {
  if (!canManageCourses(req.user)) throw ApiError.forbidden('Sólo un administrador puede modificar cursos.');
  const id = parseId(req.params.id);
  const data = parseBody(courseSchema.partial().extend({ is_active: z.boolean().optional() }).strict(), req.body);
  const columns = { year: 'year', division: 'division', specialty: 'specialty', shift: 'shift', is_active: 'is_active' };
  const values = [];
  const parts = [];
  for (const [key, column] of Object.entries(columns)) {
    if (key in data) {
      values.push(data[key]);
      parts.push(`${column} = $${values.length}`);
    }
  }
  if (!parts.length) throw ApiError.badRequest('No se recibieron cambios.');
  values.push(id);
  try {
    const result = await query(
      `UPDATE courses SET ${parts.join(', ')}, updated_at = now() WHERE id = $${values.length} RETURNING id`,
      values
    );
    if (!result.rows[0]) throw ApiError.notFound('Curso no encontrado.');
    await writeAudit({
      actor: req.user, action: 'MODIFICACIÓN_CURSO', entity: 'course', entityId: id,
      detail: data, ip: req.ip
    });
    res.json({ ok: true });
  } catch (error) {
    if (error.code === '23505') throw ApiError.conflict('Ese curso y división ya existen.');
    throw error;
  }
}));

router.delete('/:id', requireAuth, requireCsrf, asyncHandler(async (req, res) => {
  if (!canManageCourses(req.user)) throw ApiError.forbidden('Sólo un administrador puede dar de baja cursos.');
  const id = parseId(req.params.id);
  const students = await query('SELECT count(*)::int AS total FROM students WHERE course_id = $1 AND is_active = TRUE', [id]);
  if (students.rows[0].total > 0) {
    throw ApiError.conflict('El curso tiene alumnos activos. Reasígnelos antes de darlo de baja.');
  }
  const result = await query('UPDATE courses SET is_active = FALSE WHERE id = $1 RETURNING id', [id]);
  if (!result.rows[0]) throw ApiError.notFound('Curso no encontrado.');
  await writeAudit({ actor: req.user, action: 'BAJA_CURSO', entity: 'course', entityId: id, ip: req.ip });
  res.json({ ok: true });
}));

export default router;
