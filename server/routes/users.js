import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { requireAuth, requireCsrf, destroyAllUserSessions } from '../auth.js';
import { ApiError, asyncHandler, parseId } from '../lib/http.js';
import { parseBody, emailSchema, passwordSchema } from '../lib/validate.js';
import { hashPassword, passwordPolicyError } from '../lib/password.js';
import { writeAudit } from '../lib/audit.js';
import {
  canManageUsers, ROLES, DIRECTIVO_ROLES, READONLY_ROLES, COURSE_SCOPED_ROLES
} from '../permissions.js';

const router = Router();

function requireAdmin(req) {
  if (!canManageUsers(req.user)) throw ApiError.forbidden('Sólo un administrador puede gestionar usuarios.');
}

function lowerRoleSet(set) {
  return new Set([...set].map(role => role.toLowerCase()));
}

const COURSE_REQUIRED = new Set(['PROFESOR', 'PRECEPTOR', 'PAT', 'DOE']);
const GLOBAL_SCOPE_ROLES = new Set([...DIRECTIVO_ROLES, ...READONLY_ROLES, ROLES.ADMIN]);

async function getRole(client, code) {
  const result = await client.query('SELECT id, code, name FROM roles WHERE code = $1', [code]);
  if (!result.rows[0]) throw ApiError.badRequest('Rol inválido.');
  return result.rows[0];
}

async function assertCourses(client, ids) {
  if (!ids?.length) return;
  const result = await client.query(
    'SELECT id FROM courses WHERE id = ANY($1::int[]) AND is_active = TRUE',
    [ids]
  );
  if (result.rows.length !== new Set(ids).size) throw ApiError.badRequest('Uno o más cursos no existen o están inactivos.');
}

async function assertStudents(client, ids) {
  if (!ids?.length) return;
  const result = await client.query(
    'SELECT id FROM students WHERE id = ANY($1::int[]) AND is_active = TRUE',
    [ids]
  );
  if (result.rows.length !== new Set(ids).size) throw ApiError.badRequest('Uno o más alumnos no existen o están inactivos.');
}

async function syncRelations(client, userId, roleCode, data, current = {}) {
  const courseIds = [...new Set((data.courseIds ?? current.courseIds ?? []).map(Number).filter(Boolean))];
  const tutorStudentIds = [...new Set((data.tutorStudentIds ?? current.tutorStudentIds ?? []).map(Number).filter(Boolean))];
  const studentId = data.studentId !== undefined ? data.studentId : current.studentId;

  if (roleCode === ROLES.ALUMNO) {
    if (!studentId) throw ApiError.badRequest('Un usuario alumno debe estar vinculado a un legajo.');
    await assertStudents(client, [studentId]);
    const taken = await client.query(
      'SELECT id FROM users WHERE student_id = $1 AND id <> $2',
      [studentId, userId]
    );
    if (taken.rows[0]) throw ApiError.conflict('Ese alumno ya tiene una cuenta de usuario vinculada.');
  }

  if (roleCode === ROLES.TUTOR) {
    if (!tutorStudentIds.length) throw ApiError.badRequest('Un tutor debe estar vinculado al menos a un alumno.');
    await assertStudents(client, tutorStudentIds);
  }

  if (COURSE_REQUIRED.has(roleCode) && !courseIds.length) {
    throw ApiError.badRequest('Este rol necesita al menos un curso o división asignada.');
  }

  if (GLOBAL_SCOPE_ROLES.has(roleCode) && roleCode !== ROLES.ADMIN && !data.scopeAll && !current.scopeAll && !courseIds.length) {
    throw ApiError.badRequest('Asigne un ámbito global o al menos un curso.');
  }

  await client.query('DELETE FROM user_courses WHERE user_id = $1', [userId]);
  await client.query('DELETE FROM tutor_students WHERE tutor_user_id = $1', [userId]);

  if (COURSE_SCOPED_ROLES.has(roleCode) || DIRECTIVO_ROLES.has(roleCode) || READONLY_ROLES.has(roleCode)) {
    await assertCourses(client, courseIds);
    for (const courseId of courseIds) {
      await client.query('INSERT INTO user_courses (user_id, course_id) VALUES ($1, $2)', [userId, courseId]);
    }
  }

  if (roleCode === ROLES.TUTOR) {
    for (const sid of tutorStudentIds) {
      await client.query('INSERT INTO tutor_students (tutor_user_id, student_id) VALUES ($1, $2)', [userId, sid]);
    }
  }

  const finalStudentId = roleCode === ROLES.ALUMNO ? studentId : null;
  const finalScopeAll = roleCode === ROLES.ADMIN
    ? true
    : (GLOBAL_SCOPE_ROLES.has(roleCode) ? Boolean(data.scopeAll ?? current.scopeAll) : false);
  await client.query(
    'UPDATE users SET student_id = $1, scope_all = $2 WHERE id = $3',
    [finalStudentId, finalScopeAll, userId]
  );
}

async function loadAssignments(userIds) {
  if (!userIds.length) return { courses: new Map(), tutors: new Map(), students: new Map() };
  const [courses, tutors, students] = await Promise.all([
    query(
      `SELECT uc.user_id, c.id, c.year, c.division, c.specialty
       FROM user_courses uc JOIN courses c ON c.id = uc.course_id
       WHERE uc.user_id = ANY($1::uuid[])
       ORDER BY c.year, c.division, c.specialty`,
      [userIds]
    ),
    query(
      `SELECT ts.tutor_user_id, s.id, s.first_name, s.last_name, s.dni
       FROM tutor_students ts JOIN students s ON s.id = ts.student_id
       WHERE ts.tutor_user_id = ANY($1::uuid[])`,
      [userIds]
    ),
    query(
      `SELECT s.id, s.first_name, s.last_name, s.dni
       FROM students s JOIN users u ON u.student_id = s.id
       WHERE u.id = ANY($1::uuid[])`,
      [userIds]
    )
  ]);

  const courseMap = new Map();
  for (const row of courses.rows) {
    if (!courseMap.has(row.user_id)) courseMap.set(row.user_id, []);
    courseMap.get(row.user_id).push({
      id: row.id,
      year: Number(row.year),
      division: Number(row.division),
      specialty: row.specialty,
      label: `${row.year}° ${row.division}° ${row.specialty}`
    });
  }
  const tutorMap = new Map();
  for (const row of tutors.rows) {
    if (!tutorMap.has(row.tutor_user_id)) tutorMap.set(row.tutor_user_id, []);
    tutorMap.get(row.tutor_user_id).push({
      id: row.id,
      name: `${row.first_name} ${row.last_name}`.trim(),
      dni: row.dni
    });
  }
  const studentMap = new Map(students.rows.map(row => [
    row.id,
    { id: row.id, name: `${row.first_name} ${row.last_name}`.trim(), dni: row.dni }
  ]));
  return { courses: courseMap, tutors: tutorMap, students: studentMap };
}

function emptyToNull(value) {
  return value === undefined || value === '' ? null : value;
}

router.get('/', requireAuth, asyncHandler(async (req, res) => {
  requireAdmin(req);
  const result = await query(
    `SELECT u.id, u.email, u.full_name, u.student_id, u.scope_all, u.is_active,
            u.must_change_password, u.last_login_at, u.created_at,
            r.code AS role_code, r.name AS role_name
     FROM users u JOIN roles r ON r.id = u.role_id
     ORDER BY u.is_active DESC, r.sort_order, u.full_name`
  );
  const ids = result.rows.map(row => row.id);
  const assignments = await loadAssignments(ids);

  res.json({
    users: result.rows.map(row => ({
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      roleCode: row.role_code,
      roleName: row.role_name,
      studentId: row.student_id,
      student: row.student_id ? assignments.students.get(row.student_id) || null : null,
      scopeAll: Boolean(row.scope_all),
      courseIds: (assignments.courses.get(row.id) || []).map(c => c.id),
      courses: assignments.courses.get(row.id) || [],
      tutorStudentIds: (assignments.tutors.get(row.id) || []).map(s => s.id),
      tutorStudents: assignments.tutors.get(row.id) || [],
      isActive: Boolean(row.is_active),
      mustChangePassword: Boolean(row.must_change_password),
      lastLoginAt: row.last_login_at,
      createdAt: row.created_at
    }))
  });
}));

const baseUserSchema = {
  email: emailSchema,
  fullName: z.string().trim().min(3).max(120),
  roleCode: z.string().trim().min(2).max(40),
  scopeAll: z.boolean().optional(),
  courseIds: z.array(z.coerce.number().int().positive()).max(100).optional(),
  studentId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
  tutorStudentIds: z.array(z.coerce.number().int().positive()).max(20).optional(),
  isActive: z.boolean().optional()
};

const createUserSchema = z.object({ ...baseUserSchema, password: passwordSchema }).strict();
const updateUserSchema = z.object(baseUserSchema).partial().strict();
const resetPasswordSchema = z.object({ newPassword: passwordSchema }).strict();

router.post('/', requireAuth, requireCsrf, asyncHandler(async (req, res) => {
  requireAdmin(req);
  const data = parseBody(createUserSchema, req.body);
  const policyError = passwordPolicyError(data.password);
  if (policyError) throw ApiError.badRequest(policyError);
  const passwordHash = await hashPassword(data.password);

  const id = await withTransaction(async (client) => {
    const role = await getRole(client, data.roleCode);
    const inserted = await client.query(
      `INSERT INTO users (email, password_hash, full_name, role_id, is_active, must_change_password, created_by, scope_all)
       VALUES ($1, $2, $3, $4, TRUE, TRUE, $5, FALSE)
       RETURNING id`,
      [data.email, passwordHash, data.fullName, role.id, req.user.id]
    );
    const userId = inserted.rows[0].id;
    await syncRelations(client, userId, role.code, data, {});
    return userId;
  }).catch(error => {
    if (error.code === '23505') throw ApiError.conflict('Ya existe un usuario con ese mail o ese legajo vinculado.');
    throw error;
  });

  await writeAudit({
    actor: req.user, action: 'ALTA_USUARIO', entity: 'user', entityId: id,
    detail: { email: data.email, roleCode: data.roleCode }, ip: req.ip
  });
  res.status(201).json({ id, message: 'Usuario creado. Deberá cambiar la contraseña en el primer ingreso.' });
}));

router.patch('/:id', requireAuth, requireCsrf, asyncHandler(async (req, res) => {
  requireAdmin(req);
  const id = req.params.id;
  const data = parseBody(updateUserSchema, req.body);
  if (!Object.keys(data).length) throw ApiError.badRequest('No se recibieron cambios.');

  const changed = await withTransaction(async (client) => {
    const currentResult = await client.query(
      `SELECT u.*, r.code AS role_code FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1 FOR UPDATE`,
      [id]
    );
    const current = currentResult.rows[0];
    if (!current) throw ApiError.notFound('Usuario no encontrado.');

    if (id === req.user.id) {
      const changesOwnRole = Boolean(data.roleCode && data.roleCode !== current.role_code);
      if (changesOwnRole || data.isActive === false) {
        throw ApiError.forbidden('No puede cambiar su propio rol ni desactivar su propia cuenta.');
      }
    }

    const losesAdmin = current.role_code === ROLES.ADMIN &&
      (data.isActive === false || (data.roleCode && data.roleCode !== ROLES.ADMIN));
    if (losesAdmin) {
      const activeAdmins = await client.query(
        `SELECT count(*)::int AS total FROM users u JOIN roles r ON r.id = u.role_id
         WHERE r.code = 'ADMINISTRADOR' AND u.is_active = TRUE`
      );
      if (activeAdmins.rows[0].total <= 1) {
        throw ApiError.conflict('No se puede desactivar o cambiar el rol del último administrador activo.');
      }
    }

    const targetRole = data.roleCode ? await getRole(client, data.roleCode) : await getRole(client, current.role_code);
    const parts = [];
    const values = [];
    const columns = { email: 'email', fullName: 'full_name', isActive: 'is_active' };
    for (const [key, column] of Object.entries(columns)) {
      if (key in data) {
        values.push(data[key]);
        parts.push(`${column} = $${values.length}`);
      }
    }
    if (data.roleCode) {
      values.push(targetRole.id);
      parts.push(`role_id = $${values.length}`);
    }
    if (parts.length) {
      values.push(id);
      await client.query(`UPDATE users SET ${parts.join(', ')}, updated_at = now() WHERE id = $${values.length}`, values);
    }

    const relationChanged = ['roleCode', 'scopeAll', 'courseIds', 'studentId', 'tutorStudentIds'].some(key => key in data);
    if (relationChanged) {
      const currentAssignments = await client.query(
        `SELECT
           COALESCE((SELECT array_agg(course_id) FROM user_courses WHERE user_id = $1), '{}') AS course_ids,
           COALESCE((SELECT array_agg(student_id) FROM tutor_students WHERE tutor_user_id = $1), '{}') AS tutor_student_ids`,
        [id]
      );
      const currentData = {
        courseIds: currentAssignments.rows[0].course_ids,
        tutorStudentIds: currentAssignments.rows[0].tutor_student_ids,
        studentId: current.student_id,
        scopeAll: current.scope_all
      };
      await syncRelations(client, id, targetRole.code, data, currentData);
    }

    if (data.isActive === false || (data.roleCode && data.roleCode !== current.role_code)) {
      await destroyAllUserSessions(id);
    }
    return { roleCode: targetRole.code, fields: Object.keys(data) };
  }).catch(error => {
    if (error.code === '23505') throw ApiError.conflict('Ya existe un usuario con ese mail o ese legajo vinculado.');
    throw error;
  });

  await writeAudit({
    actor: req.user, action: 'MODIFICACIÓN_USUARIO', entity: 'user', entityId: id,
    detail: changed, ip: req.ip
  });
  res.json({ ok: true, message: 'Usuario actualizado.' });
}));

router.post('/:id/reset-password', requireAuth, requireCsrf, asyncHandler(async (req, res) => {
  requireAdmin(req);
  const id = req.params.id;
  const { newPassword } = parseBody(resetPasswordSchema, req.body);
  const policyError = passwordPolicyError(newPassword);
  if (policyError) throw ApiError.badRequest(policyError);
  const hash = await hashPassword(newPassword);

  const result = await query(
    'UPDATE users SET password_hash = $1, must_change_password = TRUE, failed_login_attempts = 0, locked_until = NULL WHERE id = $2 RETURNING id',
    [hash, id]
  );
  if (!result.rows[0]) throw ApiError.notFound('Usuario no encontrado.');
  await destroyAllUserSessions(id);
  await writeAudit({
    actor: req.user, action: 'RESET_CONTRASEÑA', entity: 'user', entityId: id, ip: req.ip
  });
  res.json({ ok: true, message: 'Contraseña temporal asignada. El usuario deberá cambiarla al ingresar.' });
}));

export default router;
