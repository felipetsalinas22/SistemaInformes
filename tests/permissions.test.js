import test from 'node:test';
import assert from 'node:assert/strict';

import { ROLES } from '../server/permissions.js';
import {
  canAccessStudent,
  canAnnullReport,
  canCreateReports,
  canViewNotificationsModule,
  canViewReport,
  canViewReportHistory,
  editableFields,
  readableFields,
  reportActions,
  statementIsOpen
} from '../server/permissions.js';
import { ACTIVE_SEVERITIES, isActiveSeverity } from '../server/lib/severity.js';

function user(roleCode, overrides = {}) {
  return {
    id: 10,
    full_name: 'Usuario de prueba',
    email: 'prueba@et35.test',
    role_code: roleCode,
    role_name: roleCode,
    is_active: true,
    scope_all: false,
    course_ids: [1],
    student_id: null,
    tutor_student_ids: [],
    ...overrides
  };
}

function report(overrides = {}) {
  return {
    id: 50,
    student_id: 7,
    created_by: 99,
    student_course_id: 1,
    course_id: 1,
    status: 'Pendiente',
    stage: 'descargo',
    statement_deadline: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    statement_submitted_at: null,
    ...overrides
  };
}

test('PAT: ve y comenta sólo dentro de su curso, sin crear ni dictaminar', () => {
  const pat = user(ROLES.PAT);
  const row = report();

  assert.equal(canViewReport(pat, row), true);
  assert.deepEqual(editableFields(pat, row), ['pat_notes']);
  assert.deepEqual(editableFields(pat, report({ stage: 'consejos' })), ['pat_notes']);
  assert.deepEqual(editableFields(pat, report({ stage: 'dictamen' })), []);
  assert.deepEqual(editableFields(pat, report({ status: 'Resuelto' })), []);
  assert.deepEqual(editableFields(pat, report({ student_course_id: 2 })), []);

  assert.equal(canViewReport(pat, report({ student_course_id: 2 })), false);
  assert.equal(canCreateReports(pat), false);
  assert.equal(canAnnullReport(pat, row), false);
  assert.equal(canViewReportHistory(pat), true);
  assert.equal(canViewNotificationsModule(pat), true);

  assert.equal(canAccessStudent(pat, { id: 7, course_id: 1 }), true);
  assert.equal(canAccessStudent(pat, { id: 8, course_id: 2 }), false);

  const readable = readableFields(pat, row);
  assert.ok(readable.includes('pat_notes'));
  assert.ok(readable.includes('additional_notes'));
  assert.ok(readable.includes('severity'));
  assert.ok(readable.includes('notify_student'));

  const actions = reportActions(pat, row);
  assert.equal(actions.canEdit, true);
  assert.equal(actions.editLabel, 'Completar PAT');
  assert.equal(actions.canDownload, true);
});

test('Profesor: crea y edita sus propios informes y no ve los ajenos', () => {
  const professor = user(ROLES.PROFESOR);
  const own = report({ created_by: professor.id });
  const other = report({ created_by: 123 });

  assert.equal(canCreateReports(professor), true);
  assert.equal(canCreateReports(user(ROLES.PROFESOR, { course_ids: [] })), false);
  assert.equal(canViewReport(professor, own), true);
  assert.equal(canViewReport(professor, other), false);

  const editable = editableFields(professor, own);
  assert.ok(editable.includes('reason'));
  assert.ok(editable.includes('description'));
  assert.ok(editable.includes('issue_date'));
  assert.ok(!editable.includes('severity'));
  assert.ok(!editable.includes('pat_notes'));

  assert.deepEqual(editableFields(professor, report({ created_by: professor.id, stage: 'consejos' })), []);
});

test('Alumno: descargo propio, dentro del plazo y sólo una vez', () => {
  const student = user(ROLES.ALUMNO, { student_id: 7, course_ids: [] });
  const own = report();

  assert.equal(canViewReport(student, own), true);
  assert.equal(canViewReport(student, report({ student_id: 8 })), false);
  assert.equal(statementIsOpen(student, own), true);
  assert.deepEqual(editableFields(student, own), ['student_text']);
  assert.equal(statementIsOpen(student, report({ statement_submitted_at: new Date() })), false);
  assert.equal(statementIsOpen(student, report({ statement_deadline: new Date(Date.now() - 1000) })), false);

  assert.ok(!readableFields(student, own).includes('other_considerations'));
  assert.ok(readableFields(student, report({ stage: 'dictamen' })).includes('other_considerations'));
  assert.equal(canCreateReports(student), false);
  assert.equal(canViewNotificationsModule(student), true);
});

test('Dirección: dictamina, firma y anula dentro de su ámbito', () => {
  const rector = user(ROLES.RECTOR, { scope_all: true });

  assert.equal(canCreateReports(rector), true);
  assert.equal(canViewReport(rector, report({ student_course_id: 99 })), true);

  const editable = editableFields(rector, report());
  for (const field of ['council_notes', 'additional_notes', 'severity', 'other_considerations', 'director_date', 'director_signature_image', 'notify_student', 'notify_parent']) {
    assert.ok(editable.includes(field), `falta ${field}`);
  }
  assert.equal(canAnnullReport(rector, report()), true);
  assert.equal(canAnnullReport(rector, report({ status: 'Anulado' })), false);
});

test('Consulta y familias no editan contenido pedagógico', () => {
  const secretary = user(ROLES.SECRETARIA);
  const tutor = user(ROLES.TUTOR, { tutor_student_ids: [7] });

  assert.deepEqual(editableFields(secretary, report()), []);
  assert.deepEqual(editableFields(tutor, report()), []);
  assert.equal(canViewReport(tutor, report()), true);
  assert.equal(canViewReport(tutor, report({ student_id: 8 })), false);
  assert.equal(canViewReport(secretary, report()), true);
  assert.equal(canCreateReports(secretary), false);
});

test('Sólo se admiten clasificaciones activas; Suspenso queda como histórico', () => {
  assert.deepEqual(ACTIVE_SEVERITIES, ['LEVE', 'GRAVE', 'MUY GRAVE']);
  assert.equal(isActiveSeverity('LEVE'), true);
  assert.equal(isActiveSeverity('GRAVE'), true);
  assert.equal(isActiveSeverity('MUY GRAVE'), true);
  assert.equal(isActiveSeverity('SUSPENSO'), false);
});

test('Las cuentas inactivas no pueden ver el módulo de notificaciones', () => {
  assert.equal(canViewNotificationsModule(user(ROLES.PAT, { is_active: false })), false);
  assert.equal(canViewNotificationsModule(user(ROLES.ALUMNO, { is_active: false })), false);
  assert.equal(canViewNotificationsModule(user(ROLES.ALUMNO)), true);
});
