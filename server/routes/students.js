import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { requireAuth, requireCsrf } from '../auth.js';
import { ApiError, asyncHandler, parseId } from '../lib/http.js';
import { parseBody, emailSchema, dateSchema } from '../lib/validate.js';
import { writeAudit } from '../lib/audit.js';
import { addStudentScope, addReportScope } from '../lib/scope.js';
import { canManageStudents, canAccessStudent } from '../permissions.js';

const router = Router();

function normalizeDni(value) {
  if (value === null || value === undefined) return value;
  return String(value).replace(/\D/g, '');
}

const dniSchema = z.preprocess(
  normalizeDni,
  z.string().regex(/^\d{6,10}$/, 'DNI inválido: debe tener entre 6 y 10 dígitos.')
);

const STUDENT_FIELDS = `
  s.id, s.first_name, s.last_name, s.dni, s.legajo, s.email, s.guardian_email,
  s.birth_date, s.is_active, s.created_at,
  c.id AS course_id, c.year, c.division, c.specialty, c.shift
`;
const STUDENT_FROM = `
  FROM students s
  JOIN courses c ON c.id = s.course_id
`;
const STUDENT_SELECT = `SELECT ${STUDENT_FIELDS} ${STUDENT_FROM}`;

function mapStudent(row, counts = {}) {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    name: `${row.first_name} ${row.last_name}`.trim(),
    dni: row.dni,
    legajo: row.legajo,
    email: row.email,
    guardianEmail: row.guardian_email,
    birthDate: row.birth_date,
    isActive: row.is_active,
    courseId: row.course_id,
    course: `${row.year}° ${row.division}° ${row.specialty}`,
    year: Number(row.year),
    division: Number(row.division),
    specialty: row.specialty,
    shift: row.shift || 'Mañana',
    counts: { total: 0, leve: 0, grave: 0, muyGrave: 0, suspenso: 0, pendiente: 0, resuelto: 0, ...counts }
  };
}

// Listado con conteos de los informes que el usuario puede ver.
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const user = req.user;
  const params = [];
  const studentClause = addStudentScope(user, params);
  const reportClause = addReportScope(user, params);

  const conditions = [studentClause];
  if (req.query.q) {
    params.push(`%${String(req.query.q).slice(0, 100)}%`);
    conditions.push(`(s.first_name ILIKE $${params.length} OR s.last_name ILIKE $${params.length}
      OR s.dni ILIKE $${params.length} OR s.legajo ILIKE $${params.length}
      OR concat_ws(' ', s.first_name, s.last_name) ILIKE $${params.length})`);
  }
  if (req.query.year) {
    const year = Number(req.query.year);
    if (!Number.isInteger(year) || year < 1 || year > 6) throw ApiError.badRequest('Año inválido.');
    params.push(year);
    conditions.push(`c.year = $${params.length}`);
  }
  if (req.query.division) {
    const division = Number(req.query.division);
    if (!Number.isInteger(division) || division < 1 || division > 12) throw ApiError.badRequest('División inválida.');
    params.push(division);
    conditions.push(`c.division = $${params.length}`);
  }
  if (req.query.specialty) {
    params.push(String(req.query.specialty).slice(0, 80));
    conditions.push(`c.specialty = $${params.length}`);
  }
  if (req.query.course_id) {
    params.push(parseId(req.query.course_id));
    conditions.push(`s.course_id = $${params.length}`);
  }
  if (String(req.query.include_inactive) === 'true' && canManageStudents(user)) {
    // Los administradores también pueden ver alumnos dados de baja.
  } else {
    conditions.push('s.is_active = TRUE');
  }

  const result = await query(
    `SELECT ${STUDENT_FIELDS},
       (SELECT count(*)::int FROM reports r WHERE r.student_id = s.id AND (${reportClause})) AS total,
       (SELECT count(*)::int FROM reports r WHERE r.student_id = s.id AND r.severity = 'LEVE' AND (${reportClause})) AS leve,
       (SELECT count(*)::int FROM reports r WHERE r.student_id = s.id AND r.severity = 'GRAVE' AND (${reportClause})) AS grave,
       (SELECT count(*)::int FROM reports r WHERE r.student_id = s.id AND r.severity = 'MUY GRAVE' AND (${reportClause})) AS muy_grave,
       (SELECT count(*)::int FROM reports r WHERE r.student_id = s.id AND r.severity = 'SUSPENSO' AND (${reportClause})) AS suspenso,
       (SELECT count(*)::int FROM reports r WHERE r.student_id = s.id AND r.status = 'Pendiente' AND (${reportClause})) AS pendiente,
       (SELECT count(*)::int FROM reports r WHERE r.student_id = s.id AND r.status = 'Resuelto' AND (${reportClause})) AS resuelto
     ${STUDENT_FROM}
     WHERE ${conditions.join(' AND ')}
     ORDER BY c.year, c.division, c.specialty, s.last_name, s.first_name`,
    params
  );

  res.json({
    students: result.rows.map(row => mapStudent(row, {
      total: row.total,
      leve: row.leve,
      grave: row.grave,
      muyGrave: row.muy_grave,
      suspenso: row.suspenso,
      pendiente: row.pendiente,
      resuelto: row.resuelto
    }))
  });
}));

router.get('/:id', requireAuth, asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const result = await query(`${STUDENT_SELECT} WHERE s.id = $1`, [id]);
  const row = result.rows[0];
  if (!row || !canAccessStudent(req.user, row)) throw ApiError.notFound('Alumno no encontrado.');
  res.json({ student: mapStudent(row) });
}));

const studentCreateSchema = z.object({
  first_name: z.string().trim().min(2).max(80),
  last_name: z.string().trim().min(2).max(80),
  dni: dniSchema,
  legajo: z.string().trim().max(40).optional().nullable(),
  course_id: z.coerce.number().int().positive(),
  email: z.union([emailSchema, z.literal(''), z.null()]).optional(),
  guardian_email: z.union([emailSchema, z.literal(''), z.null()]).optional(),
  birth_date: z.union([dateSchema, z.literal(''), z.null()]).optional()
}).strict();

const studentUpdateSchema = studentCreateSchema.partial().extend({
  is_active: z.boolean().optional()
}).strict();

function normalizeOptional(value) {
  return value === '' || value === undefined ? null : value;
}

async function assertActiveCourse(courseId) {
  const course = await query('SELECT id FROM courses WHERE id = $1 AND is_active = TRUE', [courseId]);
  if (!course.rows[0]) throw ApiError.badRequest('El curso seleccionado no existe o está inactivo.');
}

router.post('/', requireAuth, requireCsrf, asyncHandler(async (req, res) => {
  if (!canManageStudents(req.user)) throw ApiError.forbidden('Sólo un administrador puede crear alumnos.');
  const data = parseBody(studentCreateSchema, req.body);
  await assertActiveCourse(data.course_id);

  try {
    const result = await query(
      `INSERT INTO students (first_name, last_name, dni, legajo, course_id, email, guardian_email, birth_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        data.first_name, data.last_name, data.dni, normalizeOptional(data.legajo), data.course_id,
        normalizeOptional(data.email), normalizeOptional(data.guardian_email), normalizeOptional(data.birth_date)
      ]
    );
    const created = await query(`${STUDENT_SELECT} WHERE s.id = $1`, [result.rows[0].id]);
    await writeAudit({
      actor: req.user, action: 'ALTA_ALUMNO', entity: 'student', entityId: result.rows[0].id,
      detail: { dni: data.dni, courseId: data.course_id }, ip: req.ip
    });
    res.status(201).json({ student: mapStudent(created.rows[0]) });
  } catch (error) {
    if (error.code === '23505') throw ApiError.conflict('Ya existe un alumno con ese DNI o legajo.');
    throw error;
  }
}));

router.patch('/:id', requireAuth, requireCsrf, asyncHandler(async (req, res) => {
  if (!canManageStudents(req.user)) throw ApiError.forbidden('Sólo un administrador puede modificar alumnos.');
  const id = parseId(req.params.id);
  const data = parseBody(studentUpdateSchema, req.body);

  const columns = {
    first_name: 'first_name', last_name: 'last_name', dni: 'dni', legajo: 'legajo',
    course_id: 'course_id', email: 'email', guardian_email: 'guardian_email',
    birth_date: 'birth_date', is_active: 'is_active'
  };
  const values = [];
  const parts = [];
  for (const [key, column] of Object.entries(columns)) {
    if (key in data) {
      values.push(['legajo', 'email', 'guardian_email', 'birth_date'].includes(key)
        ? normalizeOptional(data[key])
        : data[key]);
      parts.push(`${column} = $${values.length}`);
    }
  }
  if (!parts.length) throw ApiError.badRequest('No se recibieron cambios.');
  if (data.course_id) await assertActiveCourse(data.course_id);

  values.push(id);
  try {
    const result = await query(
      `UPDATE students SET ${parts.join(', ')}, updated_at = now() WHERE id = $${values.length} RETURNING id`,
      values
    );
    if (!result.rows[0]) throw ApiError.notFound('Alumno no encontrado.');
    const updated = await query(`${STUDENT_SELECT} WHERE s.id = $1`, [id]);
    await writeAudit({
      actor: req.user, action: 'MODIFICACIÓN_ALUMNO', entity: 'student', entityId: id,
      detail: { fields: Object.keys(data), courseId: data.course_id ?? null }, ip: req.ip
    });
    res.json({ student: mapStudent(updated.rows[0]) });
  } catch (error) {
    if (error.code === '23505') throw ApiError.conflict('Ya existe un alumno con ese DNI o legajo.');
    throw error;
  }
}));

// Baja lógica por defecto: el legajo y sus informes se conservan.
// `?permanent=true` sólo elimina físicamente si no tiene informes ni cuenta.
router.delete('/:id', requireAuth, requireCsrf, asyncHandler(async (req, res) => {
  if (!canManageStudents(req.user)) throw ApiError.forbidden('Sólo un administrador puede dar de baja alumnos.');
  const id = parseId(req.params.id);

  if (String(req.query.permanent) === 'true') {
    const [reports, accounts] = await Promise.all([
      query('SELECT count(*)::int AS total FROM reports WHERE student_id = $1', [id]),
      query('SELECT count(*)::int AS total FROM users WHERE student_id = $1', [id])
    ]);
    if (reports.rows[0].total > 0) {
      throw ApiError.conflict('El alumno tiene informes registrados. Use la baja lógica para conservar el historial.');
    }
    if (accounts.rows[0].total > 0) {
      throw ApiError.conflict('El alumno tiene una cuenta vinculada. Desactive o desvincule la cuenta primero.');
    }
    const deleted = await query('DELETE FROM students WHERE id = $1 RETURNING id, dni', [id]);
    if (!deleted.rows[0]) throw ApiError.notFound('Alumno no encontrado.');
    await writeAudit({
      actor: req.user, action: 'ELIMINACIÓN_ALUMNO', entity: 'student', entityId: id,
      detail: { dni: deleted.rows[0].dni }, ip: req.ip
    });
    return res.json({ ok: true, deleted: true });
  }

  const result = await query('UPDATE students SET is_active = FALSE WHERE id = $1 RETURNING id', [id]);
  if (!result.rows[0]) throw ApiError.notFound('Alumno no encontrado.');
  await writeAudit({
    actor: req.user, action: 'BAJA_ALUMNO', entity: 'student', entityId: id, ip: req.ip
  });
  res.json({ ok: true, deleted: false });
}));

// ── Importación masiva CSV ─────────────────────────────────────────
// Columnas admitidas: first_name/nombre, last_name/apellido, dni,
// year/año, division, specialty/especialidad (o course/curso con el
// formato "1° 2° Informática"), legajo, email, guardian_email, birth_date.
// Primero se valida todo; nada se guarda hasta confirmar (dry_run=false).

const CSV_MAX_ROWS = 2000;

const HEADER_ALIASES = {
  nombre: 'first_name', first_name: 'first_name', nombres: 'first_name',
  apellido: 'last_name', apellidos: 'last_name', last_name: 'last_name',
  dni: 'dni', documento: 'dni',
  legajo: 'legajo',
  curso: 'course', course: 'course', curso_nombre: 'course',
  anio: 'year', ano: 'year', year: 'year', 'año': 'year',
  division: 'division', div: 'division',
  especialidad: 'specialty', specialty: 'specialty',
  turno: 'shift', shift: 'shift',
  email: 'email', mail: 'email', correo: 'email',
  email_tutor: 'guardian_email', mail_tutor: 'guardian_email',
  guardian_email: 'guardian_email', correo_tutor: 'guardian_email',
  fecha_nacimiento: 'birth_date', nacimiento: 'birth_date', birth_date: 'birth_date'
};

function normalizeHeader(value) {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, '_');
}

function parseCsvLine(line, delimiter) {
  const cells = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map(cell => cell.trim());
}

function parseCsv(text) {
  const clean = String(text || '').replace(/^\uFEFF/, '');
  const lines = clean.split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length < 2) throw ApiError.badRequest('El archivo CSV debe tener un encabezado y al menos una fila.');

  const delimiter = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : ',';
  const header = parseCsvLine(lines[0], delimiter).map(cell => HEADER_ALIASES[normalizeHeader(cell)] || null);
  if (!header.includes('first_name') || !header.includes('last_name') || !header.includes('dni')) {
    throw ApiError.badRequest('El CSV debe incluir las columnas nombre, apellido y dni.');
  }
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    if (rows.length >= CSV_MAX_ROWS) {
      throw ApiError.badRequest(`El archivo supera el máximo de ${CSV_MAX_ROWS} filas.`);
    }
    const cells = parseCsvLine(lines[i], delimiter);
    const row = {};
    header.forEach((key, index) => {
      if (key) row[key] = cells[index] ?? '';
    });
    rows.push({ line: i + 1, data: row });
  }
  return rows;
}

function normalizeDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }
  return raw;
}

function courseKey(year, division, specialty) {
  return `${Number(year)}|${Number(division)}|${String(specialty).trim().toLowerCase()}`;
}

function normalizeLabel(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[°º\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const importSchema = z.object({
  csv: z.string().min(1, 'El archivo está vacío.').max(500_000),
  dryRun: z.boolean().optional().default(true),
  allowPartial: z.boolean().optional().default(false)
}).strict();

router.post('/import', requireAuth, requireCsrf, asyncHandler(async (req, res) => {
  if (!canManageStudents(req.user)) throw ApiError.forbidden('Sólo un administrador puede importar alumnos.');
  const { csv, dryRun, allowPartial } = parseBody(importSchema, req.body);

  const rows = parseCsv(csv);
  const courses = await query('SELECT id, year, division, specialty, shift FROM courses WHERE is_active = TRUE');
  const byKey = new Map();
  const byLabel = new Map();
  for (const course of courses.rows) {
    byKey.set(courseKey(course.year, course.division, course.specialty), course);
    byLabel.set(normalizeLabel(`${course.year}° ${course.division}° ${course.specialty}`), course);
    byLabel.set(normalizeLabel(`${course.year} ${course.division} ${course.specialty}`), course);
  }

  const parsed = [];
  const errors = [];
  const seenDni = new Set();

  for (const { line, data } of rows) {
    const rowErrors = [];
    let course = null;

    if (data.course) {
      course = byLabel.get(normalizeLabel(data.course)) || null;
      if (!course) rowErrors.push('Curso no encontrado (use por ejemplo "1° 2° Informática").');
    } else if (data.year && data.division && data.specialty) {
      course = byKey.get(courseKey(data.year, data.division, data.specialty)) || null;
      if (!course) rowErrors.push('No existe un curso activo con ese año, división y especialidad.');
    } else {
      rowErrors.push('Indique curso o año, división y especialidad.');
    }

    const candidate = {
      first_name: String(data.first_name || '').trim(),
      last_name: String(data.last_name || '').trim(),
      dni: normalizeDni(data.dni),
      legajo: String(data.legajo || '').trim() || null,
      course_id: course?.id,
      email: String(data.email || '').trim() || null,
      guardian_email: String(data.guardian_email || '').trim() || null,
      birth_date: normalizeDate(data.birth_date)
    };

    const result = studentCreateSchema.safeParse(candidate);
    if (!result.success) {
      for (const issue of result.error.issues) {
        rowErrors.push(`${issue.path.join('.') || 'fila'}: ${issue.message}`);
      }
    }

    if (candidate.dni) {
      if (seenDni.has(candidate.dni)) rowErrors.push('DNI repetido dentro del archivo.');
      seenDni.add(candidate.dni);
    }

    if (rowErrors.length) {
      errors.push({ line, dni: candidate.dni || null, name: `${candidate.first_name} ${candidate.last_name}`.trim(), messages: rowErrors });
    } else {
      parsed.push({ line, ...result.data });
    }
  }

  // Duplicados ya existentes en la base.
  const dnis = parsed.map(row => row.dni);
  if (dnis.length) {
    const existing = await query('SELECT dni FROM students WHERE dni = ANY($1::text[])', [dnis]);
    const existingSet = new Set(existing.rows.map(row => row.dni));
    for (let i = parsed.length - 1; i >= 0; i -= 1) {
      if (existingSet.has(parsed[i].dni)) {
        errors.push({
          line: parsed[i].line,
          dni: parsed[i].dni,
          name: `${parsed[i].first_name} ${parsed[i].last_name}`.trim(),
          messages: ['Ya existe un alumno con ese DNI.']
        });
        parsed.splice(i, 1);
      }
    }
  }

  errors.sort((a, b) => a.line - b.line);

  if (dryRun || (errors.length && !allowPartial)) {
    if (!dryRun && errors.length) {
      throw ApiError.badRequest(
        `No se importó nada: ${errors.length} fila(s) con errores. Corrija el archivo o confirme la importación parcial.`,
        errors
      );
    }
    return res.json({
      dryRun: true,
      committed: false,
      total: rows.length,
      valid: parsed.length,
      invalid: errors.length,
      imported: 0,
      errors,
      preview: parsed.slice(0, 50)
    });
  }

  let imported = 0;
  await withTransaction(async (client) => {
    for (const row of parsed) {
      try {
        await client.query(
          `INSERT INTO students (first_name, last_name, dni, legajo, course_id, email, guardian_email, birth_date)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            row.first_name, row.last_name, row.dni, normalizeOptional(row.legajo), row.course_id,
            normalizeOptional(row.email), normalizeOptional(row.guardian_email), normalizeOptional(row.birth_date)
          ]
        );
        imported += 1;
      } catch (error) {
        if (error.code === '23505') {
          throw ApiError.conflict(`La fila ${row.line} (DNI ${row.dni}) coincide con un alumno ya existente. No se importó nada.`);
        }
        throw error;
      }
    }
  });

  await writeAudit({
    actor: req.user, action: 'IMPORTACIÓN_ALUMNOS', entity: 'student',
    detail: { imported, invalid: errors.length, total: rows.length }, ip: req.ip
  });

  res.status(201).json({
    dryRun: false,
    committed: true,
    total: rows.length,
    valid: parsed.length,
    invalid: errors.length,
    imported,
    errors
  });
}));

export default router;
