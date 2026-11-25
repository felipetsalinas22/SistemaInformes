// ═══════════════════════════════════════════════════════════════════
//  Ámbitos de consulta reutilizables (SQL parametrizado).
//  Regla de oro: `scope_all` sólo amplía el ámbito de roles de dirección
//  y consulta. Nunca de un profesor, preceptor, alumno o tutor.
// ═══════════════════════════════════════════════════════════════════
import { hasGlobalScope, isPatFunction, isStudent, isTutor, patCourseIds } from '../permissions.js';

/** Ámbito sobre la tabla students (alias configurable). */
export function addStudentScope(user, params, alias = 's') {
  if (!user) return 'FALSE';
  if (hasGlobalScope(user)) return 'TRUE';

  if (isStudent(user)) {
    if (!user.student_id) return 'FALSE';
    params.push(user.student_id);
    return `${alias}.id = $${params.length}`;
  }

  if (isTutor(user)) {
    const ids = (user.tutor_student_ids || []).map(Number).filter(Boolean);
    if (!ids.length) return 'FALSE';
    params.push(ids);
    return `${alias}.id = ANY($${params.length}::int[])`;
  }

  const courseIds = [...new Set([
    ...(user.course_ids || []).map(Number).filter(Boolean),
    ...patCourseIds(user)
  ])];
  if (!courseIds.length) return 'FALSE';
  params.push(courseIds);
  return `${alias}.course_id = ANY($${params.length}::int[])`;
}

/**
 * Ámbito sobre informes. Usa la instantánea histórica del curso
 * (r.student_course_id), de modo que un cambio de curso del alumno no
 * mueve ni oculta los informes ya emitidos.
 */
export function addReportScope(user, params) {
  if (!user) return 'FALSE';
  if (hasGlobalScope(user)) return 'TRUE';

  if (isStudent(user)) {
    if (!user.student_id) return 'FALSE';
    params.push(user.student_id);
    return `r.student_id = $${params.length}`;
  }

  if (isTutor(user)) {
    const ids = (user.tutor_student_ids || []).map(Number).filter(Boolean);
    if (!ids.length) return 'FALSE';
    params.push(ids);
    return `r.student_id = ANY($${params.length}::int[])`;
  }

  // Un profesor ve lo que él creó y, si tiene la función PAT, los informes
  // de los cursos asignados para seguimiento (sin permisos de edición).
  if (user.role_code === 'PROFESOR') {
    params.push(user.id);
    const creatorClause = `r.created_by = $${params.length}`;
    if (!isPatFunction(user)) return creatorClause;
    const patIds = patCourseIds(user);
    params.push(patIds);
    return `(${creatorClause} OR r.student_course_id = ANY($${params.length}::int[]))`;
  }

  // Preceptor y DOE ven los informes del curso en el que fueron emitidos.
  // Los directivos/consulta ven sus cursos asignados o todo.
  const courseIds = (user.course_ids || []).map(Number).filter(Boolean);
  if (!courseIds.length) {
    params.push(user.id);
    return `r.created_by = $${params.length}`;
  }
  params.push(courseIds);
  return `r.student_course_id = ANY($${params.length}::int[])`;
}
