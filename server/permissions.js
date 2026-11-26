// ═══════════════════════════════════════════════════════════════════
//  Permisos centralizados (se aplican SIEMPRE en el servidor).
//  Cambiar una regla de la escuela = cambiar este archivo y reiniciar.
//  El frontend recibe estos permisos, pero NUNCA es la autoridad final.
// ═══════════════════════════════════════════════════════════════════

export const ROLES = Object.freeze({
  ADMIN: 'ADMINISTRADOR',
  RECTOR: 'RECTOR',
  VICERRECTOR: 'VICERRECTOR',
  REGENTE: 'REGENTE',
  SUBREGENTE: 'SUBREGENTE',
  JEFE_TALLER: 'JEFE_TALLER',
  GERENTE: 'GERENTE',
  PROFESOR: 'PROFESOR',
  PRECEPTOR: 'PRECEPTOR',
  PAT: 'PAT',
  DOE: 'DOE',
  SECRETARIA: 'SECRETARIA',
  ASESORIA: 'ASESORIA',
  ALUMNO: 'ALUMNO',
  TUTOR: 'TUTOR'
});

export const DIRECTIVO_ROLES = new Set([
  ROLES.RECTOR, ROLES.VICERRECTOR, ROLES.REGENTE, ROLES.SUBREGENTE, ROLES.JEFE_TALLER
]);

export const READONLY_ROLES = new Set([ROLES.SECRETARIA, ROLES.ASESORIA]);
export const MANAGER_ROLES = new Set([ROLES.ADMIN, ROLES.GERENTE]);
export const CREATOR_ROLES = new Set([...MANAGER_ROLES, ROLES.PROFESOR, ROLES.PRECEPTOR, ...DIRECTIVO_ROLES]);
// PAT ya no es un rol de cuenta: es una función que se asigna a profesores.
// La constante PAT se conserva sólo para interpretar datos históricos.
export const COURSE_SCOPED_ROLES = new Set([ROLES.PROFESOR, ROLES.PRECEPTOR, ROLES.DOE]);

export const ALL_FORM_FIELDS = Object.freeze([
  'student_id', 'reason', 'description', 'issue_date',
  'student_text', 'preceptor_notes', 'pat_notes', 'council_notes',
  'additional_notes', 'severity', 'other_considerations', 'director_date',
  'issuer_signature_image', 'alumno_signature_image', 'familia_signature_image',
  'director_signature_image', 'notify_student', 'notify_parent'
]);

export const FORM_FIELD_LABELS = Object.freeze({
  student_id: 'Alumno',
  reason: 'Motivo',
  description: 'Descripción del hecho',
  issue_date: 'Fecha de emisión',
  student_text: 'Descargo del alumno/a',
  preceptor_notes: 'Observaciones de preceptoría',
  pat_notes: 'Informe PAT / Consejo de Aula',
  council_notes: 'Informe del Consejo de Convivencia',
  additional_notes: 'Aclaraciones de autoridades',
  severity: 'Clasificación de la falta',
  other_considerations: 'Medida pedagógica',
  director_date: 'Fecha del dictamen',
  issuer_signature_image: 'Firma de quien realiza el informe',
  alumno_signature_image: 'Firma del alumno/a',
  familia_signature_image: 'Firma de la familia',
  director_signature_image: 'Firma del regente / autoridad',
  notify_student: 'Notificar al alumno',
  notify_parent: 'Notificar a la familia'
});

export const STAGE_LABELS = Object.freeze({
  descargo: 'Descargo del alumno',
  consejos: 'Consejos e intervención PAT',
  dictamen: 'Dictamen de autoridad',
  notificado: 'Notificado / Resuelto'
});

export const STATUS_LABELS = Object.freeze({
  Pendiente: 'Pendiente',
  Resuelto: 'Resuelto',
  Anulado: 'Anulado'
});

const BASE_FIELDS = ['reason', 'description', 'issue_date', 'student_text', 'status', 'stage'];
const OUTCOME_FIELDS = ['severity', 'other_considerations', 'director_date', 'director_signature_image'];

export function isAdmin(user) { return user?.role_code === ROLES.ADMIN; }
/** Rol de gestión institucional (Gerente) más el administrador institucional. */
export function isManager(user) { return MANAGER_ROLES.has(user?.role_code); }
export function isDirectivo(user) { return DIRECTIVO_ROLES.has(user?.role_code); }
export function isReadonly(user) { return READONLY_ROLES.has(user?.role_code); }
export function isStudent(user) { return user?.role_code === ROLES.ALUMNO; }
export function isTutor(user) { return user?.role_code === ROLES.TUTOR; }

/** Cursos en los que la persona tiene la función PAT (independiente del rol). */
export function patCourseIds(user) {
  return (user?.pat_course_ids || user?.patCourseIds || []).map(Number).filter(Boolean);
}
export function isPatFunction(user) { return patCourseIds(user).length > 0; }
export function hasPatCourseScope(user, courseId) {
  if (courseId === null || courseId === undefined) return false;
  return patCourseIds(user).includes(Number(courseId));
}

export function isStaff(user) {
  return Boolean(user) && !isStudent(user) && !isTutor(user);
}

/**
 * Ámbito global: administrador, o dirección/consulta con scope_all.
 * Un profesor o preceptor con scope_all NUNCA obtiene acceso global.
 */
export function hasGlobalScope(user) {
  if (!user) return false;
  if (isManager(user)) return true;
  return Boolean(user.scope_all) && (isDirectivo(user) || isReadonly(user));
}

export function hasCourseScope(user, courseId) {
  if (!user) return false;
  if (hasGlobalScope(user)) return true;
  if (isStudent(user) || isTutor(user)) return false;
  if (courseId === null || courseId === undefined) return false;
  return (user.course_ids || []).map(Number).includes(Number(courseId));
}

export function canCreateReports(user) {
  if (!user || !user.is_active) return false;
  if (isStudent(user) || isTutor(user) || isReadonly(user)) return false;
  if (!CREATOR_ROLES.has(user.role_code)) return false;
  if (isManager(user) || isDirectivo(user)) return true;
  return (user.course_ids || []).length > 0;
}

export function canViewReport(user, report) {
  if (!user || !report) return false;
  if (isManager(user)) return true;
  if (isStudent(user)) return Number(report.student_id) === Number(user.student_id);
  if (isTutor(user)) return (user.tutor_student_ids || []).map(Number).includes(Number(report.student_id));
  if (String(report.created_by) === String(user.id)) return true;

  const historicalCourse = report.student_course_id ?? report.course_id;
  if (isDirectivo(user) || isReadonly(user)) return hasCourseScope(user, historicalCourse);
  // Un docente con función PAT consulta los informes de los cursos asignados
  // para seguimiento, conservando además el acceso a los informes que creó.
  if (isPatFunction(user) && hasPatCourseScope(user, historicalCourse)) return true;
  if ([ROLES.PRECEPTOR, ROLES.DOE].includes(user.role_code)) {
    return hasCourseScope(user, historicalCourse);
  }
  // Un profesor sin función PAT sólo ve los informes que él creó.
  return false;
}

export function canAccessStudent(user, student) {
  if (!user || !student) return false;
  if (hasGlobalScope(user)) return true;
  if (isStudent(user)) return Number(student.id) === Number(user.student_id);
  if (isTutor(user)) return (user.tutor_student_ids || []).map(Number).includes(Number(student.id));
  if (COURSE_SCOPED_ROLES.has(user.role_code) || isDirectivo(user) || isReadonly(user)) {
    return hasCourseScope(user, student.course_id);
  }
  if (isPatFunction(user) && hasPatCourseScope(user, student.course_id)) return true;
  return false;
}

/**
 * Campos que el usuario puede LEER. El frontend no recibe siquiera los
 * valores de los campos que no puede ver (se filtran en el servidor).
 */
export function readableFields(user, report) {
  if (!user || !report) return [];
  if (isStudent(user) || isTutor(user)) {
    const fields = [...BASE_FIELDS];
    if (report.stage === 'dictamen' || report.stage === 'notificado') {
      fields.push(...OUTCOME_FIELDS);
    }
    return fields;
  }
  return [...ALL_FORM_FIELDS, 'status', 'stage'];
}

export function statementIsOpen(user, report, now = new Date()) {
  if (!isStudent(user) || !report) return false;
  if (Number(report.student_id) !== Number(user.student_id)) return false;
  if (report.status !== 'Pendiente') return false;
  if (report.stage !== 'descargo') return false;
  if (report.statement_submitted_at) return false;
  if (!report.statement_deadline) return false;
  return new Date(report.statement_deadline).getTime() >= now.getTime();
}

/**
 * Estado del plazo de descargo, calculado siempre en el servidor para que
 * funcione aunque la sesión esté cerrada. Se usa para filtros e indicadores.
 */
export function statementState(report, now = new Date(), warningHours = 24) {
  if (!report) return 'sin_plazo';
  if (report.statement_submitted_at) return 'completado';
  if (!report.statement_deadline || report.status !== 'Pendiente' || report.stage !== 'descargo') return 'cerrado';
  const deadline = new Date(report.statement_deadline).getTime();
  if (!Number.isFinite(deadline)) return 'sin_plazo';
  const diff = deadline - now.getTime();
  if (diff < 0) return 'vencido';
  if (diff <= Number(warningHours) * 60 * 60 * 1000) return 'proximo';
  return 'pendiente';
}

/**
 * Devuelve exactamente los campos que el usuario puede MODIFICAR en esta
 * etapa. El frontend sólo renderiza estos campos; el backend rechaza
 * cualquier intento de modificar otro campo.
 */
export function editableFields(user, report) {
  if (!user || !report) return [];
  if (!canViewReport(user, report)) return [];
  if (report.status !== 'Pendiente') return [];

  const editable = new Set();
  const isCreator = String(report.created_by) === String(user.id);

  // Datos de creación: sólo el creador, antes del descargo.
  if (isCreator && CREATOR_ROLES.has(user.role_code) && report.stage === 'descargo' && !report.statement_submitted_at) {
    editable.add('reason');
    editable.add('description');
    editable.add('issue_date');
    editable.add('issuer_signature_image');
  }

  if (isStudent(user)) {
    if (statementIsOpen(user, report)) {
      editable.add('student_text');
      editable.add('alumno_signature_image');
    }
    return [...editable];
  }

  if (user.role_code === ROLES.PRECEPTOR && hasCourseScope(user, report.student_course_id ?? report.course_id)) {
    if (['descargo', 'consejos'].includes(report.stage)) {
      editable.add('preceptor_notes');
      editable.add('issuer_signature_image');
    }
  }

  // La función PAT es de consulta: nunca habilita edición. El campo PAT lo
  // completan las autoridades (o DOE) como parte de la etapa de consejos.
  if (user.role_code === ROLES.DOE && hasCourseScope(user, report.student_course_id ?? report.course_id)) {
    if (['descargo', 'consejos'].includes(report.stage)) editable.add('pat_notes');
  }

  if (isDirectivo(user) && hasCourseScope(user, report.student_course_id ?? report.course_id)) {
    editable.add('pat_notes');
    editable.add('council_notes');
    editable.add('additional_notes');
    editable.add('severity');
    editable.add('other_considerations');
    editable.add('director_date');
    editable.add('issuer_signature_image');
    editable.add('director_signature_image');
    editable.add('notify_student');
    editable.add('notify_parent');
  }

  // Consulta y familia no editan contenido pedagógico. El administrador
  // sólo conserva los datos de creación si él mismo generó el informe.
  if (isReadonly(user)) return [];
  if (isTutor(user)) {
    editable.add('familia_signature_image');
    return [...editable];
  }
  return [...editable];
}

export function canAnnullReport(user, report) {
  return Boolean(
    user && report &&
    isDirectivo(user) &&
    report.status !== 'Anulado' &&
    hasCourseScope(user, report.student_course_id ?? report.course_id)
  );
}

export function canRevertAnnullment(user, report) {
  return Boolean(
    user && report &&
    isDirectivo(user) &&
    report.status === 'Anulado' &&
    hasCourseScope(user, report.student_course_id ?? report.course_id)
  );
}

export function canViewReportHistory(user) {
  return isStaff(user);
}

export function canViewAudit(user) { return isManager(user); }
export function canManageUsers(user) { return isManager(user); }
export function canManageCourses(user) { return isManager(user); }
export function canManageStudents(user) { return isManager(user); }
export function canManageSettings(user) { return isManager(user); }
export function canManagePatFunctions(user) { return isManager(user); }

export function canViewNotificationsModule(user) {
  // El endpoint filtra siempre por recipient_user_id: cada cuenta ve sólo
  // sus propios avisos, incluso alumnado y familias.
  return Boolean(user && user.is_active);
}

export function buildPermissions(user) {
  return {
    manageUsers: canManageUsers(user),
    manageCourses: canManageCourses(user),
    manageStudents: canManageStudents(user),
    manageSettings: canManageSettings(user),
    managePatFunctions: canManagePatFunctions(user),
    manager: isManager(user),
    patFunction: isPatFunction(user),
    viewAudit: canViewAudit(user),
    viewNotifications: canViewNotificationsModule(user),
    createReports: canCreateReports(user),
    viewAllStudents: hasGlobalScope(user),
    canRequestStatement: isStudent(user)
  };
}

export function reportActions(user, report) {
  const editable = editableFields(user, report);
  const student = isStudent(user);
  let editLabel = null;
  if (student) editLabel = statementIsOpen(user, report) ? 'Responder descargo' : null;
  else if (editable.includes('student_text')) editLabel = 'Responder descargo';
  else if (editable.includes('preceptor_notes')) editLabel = 'Completar preceptoría';
  else if (editable.includes('pat_notes')) editLabel = 'Completar PAT';
  else if (editable.some(f => ['council_notes', 'severity', 'director_date'].includes(f))) editLabel = 'Dictaminar';
  else if (editable.length > 0) editLabel = 'Editar';

  return {
    canEdit: editable.length > 0,
    editLabel: editLabel || 'Ver detalle',
    canAnnul: canAnnullReport(user, report),
    canRevert: canRevertAnnullment(user, report),
    canDownload: canViewReport(user, report),
    statementOpen: student ? statementIsOpen(user, report) : false,
    editableFields: editable,
    readableFields: readableFields(user, report)
  };
}
