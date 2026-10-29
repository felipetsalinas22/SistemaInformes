import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import config from '../config.js';
import { requireAuth, requireCsrf } from '../auth.js';
import { ApiError, asyncHandler, parseId } from '../lib/http.js';
import { parseBody, dateSchema } from '../lib/validate.js';
import { writeAudit, writeReportHistory } from '../lib/audit.js';
import { notifyReportCreated, notifyStatementSubmitted, notifyDictamen, notifyAnnulment } from '../lib/notifications.js';
import { addStudentScope, addReportScope } from '../lib/scope.js';
import { ACTIVE_SEVERITIES } from '../lib/severity.js';
import {
  ALL_FORM_FIELDS, FORM_FIELD_LABELS, reportActions, canCreateReports, canAccessStudent,
  canViewReport, canViewReportHistory, editableFields, canAnnullReport, canRevertAnnullment,
  isStaff, isStudent, isTutor
} from '../permissions.js';

const router = Router();

// El curso, nombre y DNI salen de la instantánea del informe
// (r.student_*) para que un cambio posterior del alumno no altere el
// registro histórico. Los datos de contacto actuales se usan sólo para
// notificaciones y para el legajo vivo.
const REPORT_SELECT = `
  SELECT r.*,
         s.first_name, s.last_name, s.dni, s.email AS student_email,
         s.guardian_email, s.legajo, s.course_id AS current_course_id,
         c.id AS course_id, c.year, c.division, c.specialty, c.shift,
         creator.full_name AS creator_name, creator.email AS creator_email
  FROM reports r
  JOIN students s ON s.id = r.student_id
  JOIN courses c ON c.id = COALESCE(r.student_course_id, s.course_id)
  JOIN users creator ON creator.id = r.created_by
`;

const CREATION_FIELDS = ['student_id', 'reason', 'description', 'issue_date', 'severity'];
const SEVERITY_VALUES = ACTIVE_SEVERITIES;
const UPDATE_SEVERITY_VALUES = [...ACTIVE_SEVERITIES, 'SUSPENSO'];

function courseLabel(row) {
  return `${row.year}° ${row.division}° ${row.specialty}`;
}

function dateOnly(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function today() {
  return dateOnly(new Date());
}

function studentObject(row) {
  return {
    id: row.student_id,
    firstName: row.student_first_name,
    lastName: row.student_last_name,
    name: row.student_name,
    dni: row.student_dni,
    email: row.student_email || null,
    legajo: row.student_legajo || null,
    courseId: row.course_id,
    course: courseLabel(row),
    year: Number(row.year),
    division: Number(row.division),
    specialty: row.specialty,
    shift: row.shift || 'Mañana',
    currentCourseId: Number(row.current_course_id) !== Number(row.course_id) ? row.current_course_id : null
  };
}

const STAGE_ORDER = ['descargo', 'consejos', 'dictamen', 'notificado'];

function buildWorkflow(row) {
  const currentIndex = Math.max(0, STAGE_ORDER.indexOf(row.stage));
  const finished = row.status === 'Resuelto';
  const annulled = row.status === 'Anulado';

  const labels = [
    { key: 'creacion', label: 'Creación' },
    { key: 'descargo', label: 'Descargo' },
    { key: 'consejos', label: 'Consejos' },
    { key: 'dictamen', label: 'Dictamen' },
    { key: 'notificado', label: 'Notificado' }
  ];

  return labels.map((step, index) => {
    if (step.key === 'creacion') {
      return { ...step, state: 'completed' };
    }
    const stageIndex = index - 1;
    if (finished) return { ...step, state: 'completed' };
    if (annulled) return { ...step, state: stageIndex < currentIndex ? 'completed' : 'pending' };
    if (stageIndex < currentIndex) return { ...step, state: 'completed' };
    if (stageIndex === currentIndex) return { ...step, state: 'current' };
    return { ...step, state: 'pending' };
  });
}

function serializeReport(user, row, history = []) {
  const actions = reportActions(user, row);
  const readable = new Set(actions.readableFields);
  const staffView = isStaff(user);

  const out = {
    id: Number(row.id),
    student: studentObject(row),
    issuer: {
      name: row.issuer_name,
      role: row.issuer_role,
      email: staffView ? row.issuer_email : null
    },
    issueDate: dateOnly(row.issue_date),
    status: row.status,
    stage: row.stage,
    statementDeadline: row.statement_deadline,
    statementSubmittedAt: row.statement_submitted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    can: actions,
    form: {
      editableFields: actions.editableFields,
      readableFields: actions.readableFields
    },
    workflow: buildWorkflow(row)
  };

  if (readable.has('reason')) out.reason = row.reason;
  if (readable.has('description')) out.description = row.description;
  if (readable.has('student_text')) out.studentText = row.student_text;
  if (readable.has('severity')) out.severity = row.severity;
  if (readable.has('preceptor_notes')) out.preceptorNotes = row.preceptor_notes;
  if (readable.has('pat_notes')) out.patNotes = row.pat_notes;
  if (readable.has('council_notes')) out.councilNotes = row.council_notes;
  if (readable.has('additional_notes')) out.additionalNotes = row.additional_notes;
  if (readable.has('other_considerations')) out.otherConsiderations = row.other_considerations;
  if (readable.has('director_date')) out.directorDate = dateOnly(row.director_date);
  if (readable.has('director_signature_image')) out.directorSignatureImage = row.director_signature_image || null;
  if (staffView) {
    out.directorSignature = row.director_signature;
    out.notifyStudent = Boolean(row.notify_student);
    out.notifyParent = Boolean(row.notify_parent);
    out.previousStatus = row.previous_status;
    out.creatorName = row.creator_name;
  }

  if (staffView && canViewReportHistory(user)) {
    out.history = history.map(item => ({
      id: Number(item.id),
      action: item.action,
      actorName: item.actor_name,
      actorRole: item.actor_role,
      description: item.description,
      createdAt: item.created_at
    }));
  } else {
    out.history = [];
  }
  return out;
}

function serializeSummary(user, row) {
  const actions = reportActions(user, row);
  const readable = new Set(actions.readableFields);
  const summary = {
    id: Number(row.id),
    student: {
      id: row.student_id,
      name: row.student_name,
      dni: row.student_dni,
      course: courseLabel(row),
      courseId: row.course_id
    },
    issuer: { name: row.issuer_name, role: row.issuer_role },
    issueDate: dateOnly(row.issue_date),
    status: row.status,
    stage: row.stage,
    statementDeadline: row.statement_deadline,
    statementSubmittedAt: row.statement_submitted_at,
    updatedAt: row.updated_at,
    can: {
      canEdit: actions.canEdit,
      editLabel: actions.editLabel,
      canAnnul: actions.canAnnul,
      canRevert: actions.canRevert,
      statementOpen: actions.statementOpen
    },
    workflow: buildWorkflow(row)
  };
  if (readable.has('reason')) summary.reason = row.reason;
  if (readable.has('description')) summary.description = row.description;
  if (readable.has('severity')) summary.severity = row.severity;
  return summary;
}

async function fetchReportRow(clientOrPool, id) {
  const executor = clientOrPool.query ? clientOrPool : { query };
  const result = await executor.query(`${REPORT_SELECT} WHERE r.id = $1`, [id]);
  return result.rows[0] || null;
}

async function fetchHistory(executor, reportId) {
  const result = await executor.query(
    `SELECT id, action, actor_name, actor_role, description, created_at
     FROM report_history WHERE report_id = $1 ORDER BY created_at ASC, id ASC`,
    [reportId]
  );
  return result.rows;
}

async function statementDays(client) {
  try {
    const result = await client.query(`SELECT value FROM settings WHERE key = 'statement_days'`);
    const value = Number(result.rows[0]?.value);
    if (Number.isFinite(value) && value >= 1 && value <= 30) return value;
  } catch (_) {}
  return config.statementDays;
}

// ── Metadatos para el formulario (cursos/alumnos a los que puede acceder) ──
router.get('/meta', requireAuth, asyncHandler(async (req, res) => {
  const user = req.user;
  const params = [];
  const clause = addStudentScope(user, params);
  const result = await query(
    `SELECT s.id, s.first_name, s.last_name, s.dni, s.email, s.legajo,
            c.id AS course_id, c.year, c.division, c.specialty, c.shift
     FROM students s
     JOIN courses c ON c.id = s.course_id
     WHERE s.is_active = TRUE AND (${clause})
     ORDER BY c.year, c.division, c.specialty, s.last_name, s.first_name`,
    params
  );

  const coursesMap = new Map();
  for (const row of result.rows) {
    if (!coursesMap.has(row.course_id)) {
      coursesMap.set(row.course_id, {
        id: row.course_id,
        year: Number(row.year),
        division: Number(row.division),
        specialty: row.specialty,
        shift: row.shift || 'Mañana',
        label: courseLabel(row),
        students: []
      });
    }
    coursesMap.get(row.course_id).students.push({
      id: row.id,
      name: `${row.first_name} ${row.last_name}`.trim(),
      firstName: row.first_name,
      lastName: row.last_name,
      dni: row.dni,
      email: row.email,
      legajo: row.legajo,
      courseId: row.course_id,
      course: courseLabel(row),
      year: Number(row.year),
      division: Number(row.division),
      specialty: row.specialty
    });
  }

  res.json({
    canCreate: canCreateReports(user),
    creationFields: CREATION_FIELDS,
    courses: [...coursesMap.values()],
    today: today(),
    statementDays: await statementDays({ query }),
    editableFieldLabels: FORM_FIELD_LABELS
  });
}));

// ── Listado ────────────────────────────────────────────────────────
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const user = req.user;
  const params = [];
  const conditions = [addReportScope(user, params)];

  if (req.query.status) {
    if (!['Pendiente', 'Resuelto', 'Anulado'].includes(req.query.status)) {
      throw ApiError.badRequest('Estado inválido.');
    }
    params.push(req.query.status);
    conditions.push(`r.status = $${params.length}`);
  }
  if (req.query.severity) {
    if (!SEVERITY_VALUES.includes(req.query.severity)) {
      throw ApiError.badRequest('Gravedad inválida. Los valores admitidos son Leve, Grave o Muy grave.');
    }
    params.push(req.query.severity);
    conditions.push(`r.severity = $${params.length}`);
  }
  if (req.query.stage) {
    if (!['descargo', 'consejos', 'dictamen', 'notificado'].includes(req.query.stage)) {
      throw ApiError.badRequest('Etapa inválida.');
    }
    params.push(req.query.stage);
    conditions.push(`r.stage = $${params.length}`);
  }
  if (req.query.q) {
    params.push(`%${String(req.query.q).slice(0, 100)}%`);
    conditions.push(`(r.student_name ILIKE $${params.length} OR r.student_dni ILIKE $${params.length}
      OR r.issuer_name ILIKE $${params.length} OR creator.full_name ILIKE $${params.length}
      OR s.first_name ILIKE $${params.length} OR s.last_name ILIKE $${params.length})`);
  }
  if (req.query.issuer) {
    params.push(`%${String(req.query.issuer).slice(0, 100)}%`);
    conditions.push(`(r.issuer_name ILIKE $${params.length} OR creator.full_name ILIKE $${params.length})`);
  }
  if (req.query.student_id && !isStudent(user) && !isTutor(user)) {
    const studentId = parseId(req.query.student_id);
    params.push(studentId);
    conditions.push(`r.student_id = $${params.length}`);
  }
  if (req.query.course_id) {
    params.push(parseId(req.query.course_id));
    conditions.push(`r.student_course_id = $${params.length}`);
  }

  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 200));
  params.push(limit);
  const limitParam = params.length;

  const result = await query(
    `${REPORT_SELECT}
     WHERE ${conditions.join(' AND ')}
     ORDER BY r.created_at DESC, r.id DESC
     LIMIT $${limitParam}`,
    params
  );

  res.json({ reports: result.rows.map(row => serializeSummary(user, row)) });
}));

// ── Detalle ────────────────────────────────────────────────────────
router.get('/:id', requireAuth, asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const row = await fetchReportRow({ query }, id);
  if (!row || !canViewReport(req.user, row)) throw ApiError.notFound('Informe no encontrado.');
  const history = isStaff(req.user) ? await fetchHistory({ query }, id) : [];
  res.json({ report: serializeReport(req.user, row, history) });
}));

// ── Crear ──────────────────────────────────────────────────────────
const createSchema = z.object({
  student_id: z.coerce.number().int().positive(),
  reason: z.string().trim().min(3, 'Indique el motivo del informe.').max(300),
  description: z.string().trim().min(10, 'La descripción debe tener al menos 10 caracteres.').max(5000),
  issue_date: dateSchema,
  severity: z.enum(SEVERITY_VALUES, {
    error: 'Seleccione la clasificación de la falta: Leve, Grave o Muy grave.'
  })
}).strict();

router.post('/', requireAuth, requireCsrf, asyncHandler(async (req, res) => {
  const user = req.user;
  if (!canCreateReports(user)) throw ApiError.forbidden('Su rol no tiene permiso para crear informes.');

  const attempted = Object.keys(req.body || {}).filter(key => ALL_FORM_FIELDS.includes(key));
  const forbidden = attempted.filter(field => !CREATION_FIELDS.includes(field));
  if (forbidden.length) {
    throw ApiError.forbidden(`No puede completar en esta etapa: ${forbidden.map(f => FORM_FIELD_LABELS[f] || f).join(', ')}.`);
  }

  const data = parseBody(createSchema, req.body);
  if (data.issue_date > today()) throw ApiError.badRequest('La fecha de emisión no puede ser futura.');

  const created = await withTransaction(async (client) => {
    const studentResult = await client.query(
      `SELECT s.*, c.year, c.division, c.specialty, c.shift
       FROM students s JOIN courses c ON c.id = s.course_id
       WHERE s.id = $1 AND s.is_active = TRUE`,
      [data.student_id]
    );
    const student = studentResult.rows[0];
    if (!student) throw ApiError.badRequest('El alumno seleccionado no existe o está inactivo.');
    if (!canAccessStudent(user, student)) throw ApiError.forbidden('No puede crear informes sobre alumnos fuera de su ámbito.');

    const days = await statementDays(client);
    const inserted = await client.query(
      `INSERT INTO reports
        (student_id, created_by, issuer_name, issuer_role, issuer_email, issue_date, reason, description,
         severity, statement_deadline, student_course_id, student_first_name, student_last_name, student_name,
         student_dni, student_year, student_division, student_specialty, student_shift, student_legajo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
               date_trunc('day', now()) + ($10::int * interval '1 day') + interval '23 hours 59 minutes',
               $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
       RETURNING id`,
      [
        data.student_id, user.id, user.full_name, user.role_name, user.email,
        data.issue_date, data.reason, data.description, data.severity, days,
        student.course_id, student.first_name, student.last_name,
        `${student.first_name} ${student.last_name}`.trim(), student.dni,
        student.year, student.division, student.specialty, student.shift, student.legajo
      ]
    );
    const reportId = inserted.rows[0].id;

    await writeReportHistory(client, {
      reportId,
      action: 'CREACIÓN',
      actor: user,
      description: `Informe creado. Motivo: ${data.reason}`
    });

    const reportRow = await fetchReportRow(client, reportId);
    await notifyReportCreated(client, reportRow, user);
    return reportRow;
  });

  const history = await fetchHistory({ query }, created.id);
  await writeAudit({
    actor: user,
    action: 'CREACIÓN_INFORME',
    entity: 'report',
    entityId: created.id,
    detail: { studentId: data.student_id, severity: data.severity, stage: 'descargo' },
    ip: req.ip
  });

  res.status(201).json({ report: serializeReport(user, created, history) });
}));

// ── Actualizar campos autorizados de la etapa ─────────────────────
const fieldSchemas = {
  reason: z.string().trim().min(3).max(300),
  description: z.string().trim().min(10).max(5000),
  issue_date: dateSchema,
  student_text: z.string().trim().min(1, 'El descargo no puede estar vacío.').max(5000),
  preceptor_notes: z.string().max(5000),
  pat_notes: z.string().max(5000),
  council_notes: z.string().max(5000),
  additional_notes: z.string().max(2000),
  severity: z.enum(UPDATE_SEVERITY_VALUES, {
    error: 'La clasificación debe ser Leve, Grave o Muy grave. Suspenso ya no es una opción válida.'
  }),
  other_considerations: z.string().max(1000),
  director_date: z.union([dateSchema, z.literal('')]),
  director_signature_image: z.string()
    .max(1_500_000, 'La firma es demasiado grande.')
    .regex(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/, 'La firma debe ser una imagen PNG válida.'),
  notify_student: z.boolean(),
  notify_parent: z.boolean()
};

const updateSchema = z.object(fieldSchemas).partial().strict();

router.patch('/:id', requireAuth, requireCsrf, asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const user = req.user;

  const result = await withTransaction(async (client) => {
    const locked = await client.query(`${REPORT_SELECT} WHERE r.id = $1 FOR UPDATE OF r`, [id]);
    const row = locked.rows[0];
    if (!row || !canViewReport(user, row)) throw ApiError.notFound('Informe no encontrado.');
    if (row.status !== 'Pendiente') throw ApiError.forbidden('El informe ya no admite modificaciones en su estado actual.');

    const allowed = editableFields(user, row);
    const sent = Object.keys(req.body || {}).filter(key => ALL_FORM_FIELDS.includes(key));
    const unauthorized = sent.filter(field => !allowed.includes(field));
    if (unauthorized.length) {
      throw ApiError.forbidden(`No puede modificar en esta etapa: ${unauthorized.map(f => FORM_FIELD_LABELS[f] || f).join(', ')}.`);
    }
    if (!sent.length) throw ApiError.badRequest('No se recibieron campos para actualizar.');

    const data = parseBody(updateSchema, req.body);
    if (data.severity === 'SUSPENSO' && row.severity !== 'SUSPENSO') {
      throw ApiError.badRequest('Suspenso ya no es una clasificación válida. Elija Leve, Grave o Muy grave.');
    }
    if (data.issue_date && data.issue_date > today()) throw ApiError.badRequest('La fecha de emisión no puede ser futura.');
    if (data.director_date && data.director_date > today()) throw ApiError.badRequest('La fecha del dictamen no puede ser futura.');
    if (data.director_date && data.director_date < dateOnly(row.issue_date)) {
      throw ApiError.badRequest('La fecha del dictamen no puede ser anterior a la fecha de emisión.');
    }

    const updates = {};
    const historyEntries = [];
    let newStage = row.stage;
    let newStatus = row.status;
    let statementJustSubmitted = false;
    let dictamenJustIssued = false;
    let notices = null;

    const creationChanged = {};
    for (const field of ['reason', 'description', 'issue_date']) {
      if (field in data && String(data[field]) !== String(row[field] ?? '')) {
        creationChanged[field] = data[field];
        updates[field] = data[field];
      }
    }

    if ('preceptor_notes' in data && data.preceptor_notes !== row.preceptor_notes) {
      updates.preceptor_notes = data.preceptor_notes;
      historyEntries.push({ action: 'INTERVENCIÓN_PRECEPTOR', description: 'Se actualizaron las observaciones de preceptoría.' });
    }
    if ('pat_notes' in data && data.pat_notes !== row.pat_notes) {
      updates.pat_notes = data.pat_notes;
      historyEntries.push({ action: 'INTERVENCIÓN_PAT', description: 'Se actualizó el informe PAT / Consejo de Aula.' });
    }
    if ('student_text' in data) {
      updates.student_text = data.student_text;
      updates.statement_submitted_at = new Date();
      newStage = 'consejos';
      statementJustSubmitted = true;
    }

    const dictamenFields = ['council_notes', 'additional_notes', 'severity', 'other_considerations', 'director_date', 'director_signature_image', 'notify_student', 'notify_parent'];
    const touchedDictamen = dictamenFields.filter(field => field in data);
    for (const field of dictamenFields) {
      if (field in data) updates[field] = data[field] === '' ? null : data[field];
    }

    if (touchedDictamen.length) {
      if (data.director_date) {
        const signatureImage = data.director_signature_image || row.director_signature_image;
        if (!signatureImage) {
          throw ApiError.badRequest('Para finalizar el informe debe dibujar la firma de la autoridad.');
        }
        const finalSeverity = data.severity || row.severity;
        updates.director_signature = `FIRMADO_AUTORIDAD_${user.role_code}_${String(user.id).slice(0, 8).toUpperCase()}`;
        updates.director_signature_image = signatureImage;
        updates.director_user_id = user.id;
        newStage = 'notificado';
        newStatus = 'Resuelto';
        dictamenJustIssued = true;
        historyEntries.push({
          action: 'DICTAMEN',
          description: `Dictamen emitido y firmado. Clasificación: ${finalSeverity}. ${data.other_considerations || row.other_considerations || ''}`.trim()
        });
        notices = {
          notifyStudent: 'notify_student' in data ? data.notify_student : row.notify_student,
          notifyParent: 'notify_parent' in data ? data.notify_parent : row.notify_parent
        };
      } else {
        if (['descargo', 'consejos'].includes(newStage)) newStage = 'dictamen';
        historyEntries.push({
          action: 'DICTAMEN_PARCIAL',
          description: 'Se guardaron datos del dictamen sin fecha de cierre.'
        });
      }
    }

    if (creationChanged && Object.keys(creationChanged).length) {
      historyEntries.unshift({
        action: 'EDICIÓN',
        description: `Se editó el informe (${Object.keys(creationChanged).map(f => FORM_FIELD_LABELS[f] || f).join(', ')}).`
      });
    }

    if (!Object.keys(updates).length) {
      throw ApiError.badRequest('Los valores enviados no generan cambios.');
    }
    updates.stage = newStage;
    updates.status = newStatus;

    const values = [];
    const setParts = Object.entries(updates).map(([column, value]) => {
      values.push(value);
      return `${column} = $${values.length}`;
    });
    values.push(id);
    await client.query(
      `UPDATE reports SET ${setParts.join(', ')}, updated_at = now() WHERE id = $${values.length}`,
      values
    );

    for (const entry of historyEntries) {
      await writeReportHistory(client, {
        reportId: id,
        action: entry.action,
        actor: user,
        description: entry.description
      });
    }

    const updatedRow = await fetchReportRow(client, id);
    if (statementJustSubmitted) await notifyStatementSubmitted(client, updatedRow, user);
    if (dictamenJustIssued) await notifyDictamen(client, updatedRow, user, notices);

    return { row: updatedRow, changed: Object.keys(updates), historyEntries };
  });

  const history = await fetchHistory({ query }, id);
  await writeAudit({
    actor: user,
    action: result.historyEntries[0]?.action || 'EDICIÓN',
    entity: 'report',
    entityId: id,
    detail: { fields: result.historyEntries.map(e => e.action) },
    ip: req.ip
  });

  res.json({ report: serializeReport(user, result.row, history) });
}));

// ── Anulación y reversión (sólo directivos del ámbito) ─────────────
const annulSchema = z.object({ motivo: z.string().trim().min(5, 'Indique un motivo de al menos 5 caracteres.').max(1000) });

router.post('/:id/annul', requireAuth, requireCsrf, asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const { motivo } = parseBody(annulSchema, req.body);
  const user = req.user;

  const row = await withTransaction(async (client) => {
    const locked = await client.query(`${REPORT_SELECT} WHERE r.id = $1 FOR UPDATE OF r`, [id]);
    const report = locked.rows[0];
    if (!report || !canViewReport(user, report)) throw ApiError.notFound('Informe no encontrado.');
    if (!canAnnullReport(user, report)) throw ApiError.forbidden('No tiene permiso para anular este informe.');

    await client.query(
      `UPDATE reports SET status = 'Anulado', previous_status = status, updated_at = now() WHERE id = $1`,
      [id]
    );
    await writeReportHistory(client, {
      reportId: id,
      action: 'ANULADO',
      actor: user,
      description: `Informe anulado. Motivo: ${motivo}. Estado anterior: ${report.status}.`
    });
    const updated = await fetchReportRow(client, id);
    await notifyAnnulment(client, updated, user, motivo);
    return updated;
  });

  const history = await fetchHistory({ query }, id);
  await writeAudit({
    actor: user,
    action: 'ANULACIÓN',
    entity: 'report',
    entityId: id,
    detail: { previousStatus: row.previous_status, motivo },
    ip: req.ip
  });
  res.json({ report: serializeReport(user, row, history) });
}));

router.post('/:id/revert', requireAuth, requireCsrf, asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const user = req.user;

  const row = await withTransaction(async (client) => {
    const locked = await client.query(`${REPORT_SELECT} WHERE r.id = $1 FOR UPDATE OF r`, [id]);
    const report = locked.rows[0];
    if (!report || !canViewReport(user, report)) throw ApiError.notFound('Informe no encontrado.');
    if (!canRevertAnnullment(user, report)) throw ApiError.forbidden('No tiene permiso para revertir esta anulación.');

    const restored = report.previous_status || 'Pendiente';
    await client.query(
      `UPDATE reports SET status = $1, previous_status = NULL, updated_at = now() WHERE id = $2`,
      [restored, id]
    );
    await writeReportHistory(client, {
      reportId: id,
      action: 'REVERTIDO',
      actor: user,
      description: `Se revirtió la anulación. Estado restaurado: ${restored}.`
    });
    return fetchReportRow(client, id);
  });

  const history = await fetchHistory({ query }, id);
  await writeAudit({
    actor: user,
    action: 'REVERSIÓN',
    entity: 'report',
    entityId: id,
    detail: { restoredStatus: row.status },
    ip: req.ip
  });
  res.json({ report: serializeReport(user, row, history) });
}));

// Los informes escolares no se eliminan: se anulan y conservan su historial.
router.delete('/:id', requireAuth, asyncHandler(async (_req, _res) => {
  throw ApiError.forbidden('Los informes no se eliminan. Deben anularse para conservar el historial institucional.');
}));

export default router;
