/* ══════════════════════════════════════════════════════════════════
   ET35 · Aplicación de informes de convivencia
   El servidor es la autoridad de permisos. Este archivo sólo dibuja
   los campos/acciones que la API autorizó para la sesión actual.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const api = window.ET35.api;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  // Pad de firma manuscrita del formulario de dictamen.
  let signaturePad = null;

  const state = {
    me: null,
    permissions: {},
    meta: null,
    roles: [],
    courses: [],
    settings: {},
    reports: [],
    students: [],
    adminStudents: [],
    adminStudentsLoaded: false,
    users: [],
    auditEntries: [],
    notifications: [],
    reportTab: 'todos',
    adminTab: 'usuarios',
    selectedStudent: null,
    editingReport: null,
    formFields: [],
    historyStudent: null,
    historyReports: [],
    importCsvText: '',
    importResult: null,
    forcedPassword: false,
    demoMode: false,
    schoolName: 'Escuela Técnica N° 35 D.E. 18',
    configLoaded: false
  };

  const ROLE_FALLBACK = [
    { code: 'ADMINISTRADOR', name: 'Administrador' },
    { code: 'RECTOR', name: 'Rector/a' },
    { code: 'VICERRECTOR', name: 'Vicerrector/a' },
    { code: 'REGENTE', name: 'Regente' },
    { code: 'SUBREGENTE', name: 'Subregente' },
    { code: 'JEFE_TALLER', name: 'Jefe/a de Taller' },
    { code: 'PROFESOR', name: 'Profesor/a' },
    { code: 'PRECEPTOR', name: 'Preceptor/a' },
    { code: 'PAT', name: 'Equipo PAT' },
    { code: 'DOE', name: 'Equipo DOE' },
    { code: 'SECRETARIA', name: 'Secretaría' },
    { code: 'ASESORIA', name: 'Asesoría' },
    { code: 'ALUMNO', name: 'Alumno/a' },
    { code: 'TUTOR', name: 'Tutor/a' }
  ];

  const ROLE_HELP = {
    ADMINISTRADOR: 'Acceso administrativo total. No dictamina ni modifica contenido pedagógico.',
    RECTOR: 'Dirección: supervisa, dictamina y anula informes de su ámbito.',
    VICERRECTOR: 'Dirección: supervisa, dictamina y anula informes de su ámbito.',
    REGENTE: 'Dirección: supervisa, dictamina y anula informes de su ámbito.',
    SUBREGENTE: 'Dirección: supervisa, dictamina y anula informes de su ámbito.',
    JEFE_TALLER: 'Dirección: supervisa, dictamina y anula informes de su ámbito.',
    PROFESOR: 'Crea informes de alumnos de los cursos asignados y ve sólo los que creó.',
    PRECEPTOR: 'Completa observaciones de preceptoría en los cursos asignados.',
    PAT: 'Completa informes del PAT / Consejo de Aula en los cursos asignados.',
    DOE: 'Completa informes del DOE en los cursos asignados.',
    SECRETARIA: 'Consulta informes de los cursos asignados, sin editar contenido.',
    ASESORIA: 'Consulta informes de los cursos asignados, sin editar contenido.',
    ALUMNO: 'Accede únicamente a su propio legajo y puede responder su descargo.',
    TUTOR: 'Accede únicamente a los legajos de los alumnos a su cargo.'
  };

  const COURSE_ROLES = ['PROFESOR', 'PRECEPTOR', 'PAT', 'DOE'];
  const GLOBAL_SCOPE_ROLES = ['RECTOR', 'VICERRECTOR', 'REGENTE', 'SUBREGENTE', 'JEFE_TALLER', 'SECRETARIA', 'ASESORIA'];
  const CREATION_FIELDS = ['reason', 'description', 'issue_date'];

  const FIELD_LABELS = {
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
    notify_student: 'Notificar al alumno/a',
    notify_parent: 'Notificar a la familia'
  };

  const FIELD_PROPS = {
    reason: 'reason',
    description: 'description',
    issue_date: 'issueDate',
    student_text: 'studentText',
    preceptor_notes: 'preceptorNotes',
    pat_notes: 'patNotes',
    council_notes: 'councilNotes',
    additional_notes: 'additionalNotes',
    severity: 'severity',
    other_considerations: 'otherConsiderations',
    director_date: 'directorDate',
    notify_student: 'notifyStudent',
    notify_parent: 'notifyParent'
  };

  const REPORT_SECTIONS = [
    { title: 'Hecho informado', fields: ['reason', 'description', 'issue_date'] },
    { title: 'Descargo del alumno/a', fields: ['student_text'] },
    { title: 'Intervenciones institucionales', fields: ['preceptor_notes', 'pat_notes'] },
    { title: 'Dictamen / Consejo de Convivencia', fields: ['council_notes', 'severity', 'other_considerations', 'director_date'] },
    { title: 'Aclaraciones de autoridades', fields: ['additional_notes'] },
    { title: 'Notificaciones', fields: ['notify_student', 'notify_parent'] }
  ];

  const SEVERITY_LABELS = {
    LEVE: 'Leve',
    GRAVE: 'Grave',
    'MUY GRAVE': 'Muy grave',
    SUSPENSO: 'Suspenso'
  };

  const STAGE_LABELS = {
    descargo: 'Descargo',
    consejos: 'Consejos / PAT',
    dictamen: 'Dictamen',
    notificado: 'Notificado'
  };

  // ── Utilidades ───────────────────────────────────────────────────
  function esc(value) {
    return String(value === undefined || value === null ? '' : value).replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function norm(value) {
    return String(value === undefined || value === null ? '' : value)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function truncate(value, max = 160) {
    const text = String(value || '');
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  }

  function todayInput() {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function fmtDate(value) {
    if (!value) return '—';
    const raw = String(value);
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[3]}/${match[2]}/${match[1]}`;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('es-AR');
  }

  function fmtDateTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return `${date.toLocaleDateString('es-AR')} ${date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;
  }

  function dateValue(value) {
    if (!value) return '';
    const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : '';
  }

  function initials(name) {
    return String(name || '?').trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase() || '?';
  }

  function isStaff() {
    return Boolean(state.me) && !['ALUMNO', 'TUTOR'].includes(state.me.roleCode);
  }

  function hasAdminAccess() {
    const p = state.permissions || {};
    return Boolean(p.manageUsers || p.manageStudents || p.manageCourses || p.manageSettings || p.viewAudit);
  }

  function roleName(code) {
    const role = state.roles.find(item => item.code === code);
    return role ? role.name : (ROLE_FALLBACK.find(item => item.code === code) || {}).name || code || '—';
  }

  function courseLabel(course) {
    return course ? course.label || `${course.year}° ${course.division}° ${course.specialty}` : '—';
  }

  function courseById(id) {
    return state.courses.find(course => Number(course.id) === Number(id)) || null;
  }

  function statusClass(status) {
    if (status === 'Resuelto') return 'status-resuelto';
    if (status === 'Anulado') return 'status-anulado';
    return 'status-pendiente';
  }

  function severityBadge(severity) {
    if (!severity) return '';
    const classes = {
      LEVE: 'badge-leve',
      GRAVE: 'badge-grave',
      'MUY GRAVE': 'badge-muygrave',
      SUSPENSO: 'badge-suspenso'
    };
    return `<span class="badge ${classes[severity] || ''}">${esc(SEVERITY_LABELS[severity] || severity)}</span>`;
  }

  function stageBadge(stage) {
    return `<span class="stage-badge">${esc(STAGE_LABELS[stage] || stage || '—')}</span>`;
  }

  function toast(message, type = 'info') {
    const container = $('#toast-container');
    if (!container) return;
    const node = document.createElement('div');
    node.className = 'toast';
    node.textContent = `${type === 'error' ? '✕' : (type === 'success' ? '✓' : 'i')} ${message}`;
    node.style.background = type === 'error' ? '#9f2317' : (type === 'success' ? '#365c36' : '#1e293b');
    container.appendChild(node);
    window.setTimeout(() => node.remove(), 5200);
  }

  function setMessage(target, type, text) {
    const element = typeof target === 'string' ? document.getElementById(target) : target;
    if (!element) return;
    element.innerHTML = text ? `<div class="${type === 'error' ? 'form-error' : (type === 'success' ? 'form-success' : 'form-warning')}">${esc(text)}</div>` : '';
  }

  function errorMessage(error) {
    if (!error) return 'Ocurrió un error inesperado.';
    return error.message || 'No se pudo completar la operación.';
  }

  function openModal(id) {
    if (state.forcedPassword && id !== 'modal-password') return;
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeModal(id) {
    if (id === 'modal-password' && state.forcedPassword) return;
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('open');
    if (!$('.modal-overlay.open')) document.body.style.overflow = '';
  }

  function closeAllModals(force = false) {
    if (state.forcedPassword && !force) return;
    $$('.modal-overlay.open').forEach(modal => modal.classList.remove('open'));
    document.body.style.overflow = '';
  }

  function closeSidebar() {
    $('#sidebar')?.classList.remove('open');
    $('#sidebar-overlay')?.classList.remove('open');
  }

  // ── Sesión y arranque ───────────────────────────────────────────
  async function boot() {
    bindEvents();

    try {
      const config = await api.config();
      state.demoMode = Boolean(config.demoMode);
      if (config.schoolName) state.schoolName = config.schoolName;
      state.configLoaded = true;
      if (state.demoMode) {
        $('#badge-demo')?.classList.remove('hidden');
        const notice = $('#login-demo-notice');
        if (notice) {
          notice.innerHTML = '<strong>Instancia de demostración.</strong> Se restauró la nómina original de alumnos; '
            + 'los informes, observaciones y cuentas son de prueba. No cargue información adicional de alumnos '
            + 'hasta definir el uso institucional y las políticas de privacidad.';
        }
      }
    } catch (_) {
      // Si falla /auth/config, se intenta igualmente reanudar la sesión.
    }

    try {
      const session = await api.me();
      await startSession(session);
    } catch (error) {
      if (error && error.status !== 401) {
        showLogin('No se pudo verificar la sesión con el servidor. Intente nuevamente.');
      } else {
        showLogin();
      }
    } finally {
      $('#auth-loading')?.classList.add('hidden');
    }
  }

  async function startSession(session) {
    state.me = session.user;
    state.permissions = session.permissions || {};
    api.setCsrf(session.csrfToken);
    state.forcedPassword = false;

    document.body.classList.remove('logged-out');
    document.body.classList.add('logged-in');
    $('#auth-loading')?.classList.add('hidden');

    renderUserChrome();
    try {
      await loadAllData();
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
    showSection('informes');

    if (state.me.mustChangePassword) {
      window.setTimeout(() => openPasswordModal(true), 120);
    }
  }

  function showLogin(message) {
    closeAllModals(true);
    state.me = null;
    state.permissions = {};
    state.forcedPassword = false;
    api.setCsrf(null);
    document.body.classList.add('logged-out');
    document.body.classList.remove('logged-in');
    $('#auth-loading')?.classList.add('hidden');
    $('#login-password').value = '';
    const errorBox = $('#login-error');
    if (errorBox) {
      errorBox.textContent = message || '';
      errorBox.style.display = message ? 'block' : 'none';
    }
    const submit = $('#loginSubmitBtn');
    if (submit) {
      submit.disabled = false;
      submit.textContent = 'Ingresar';
    }
  }

  async function logout() {
    try {
      await api.logout();
    } catch (_) {
      // La sesión puede haber expirado ya; se limpia el estado local igualmente.
    }
    state.reports = [];
    state.students = [];
    state.adminStudents = [];
    state.users = [];
    state.notifications = [];
    showLogin();
    toast('Sesión cerrada.', 'success');
  }

  function renderUserChrome() {
    const me = state.me;
    if (!me) return;
    const name = me.fullName || me.email;
    $('#sidebar-user-name').textContent = name;
    $('#sidebar-user-role').textContent = me.roleName || roleName(me.roleCode);
    $('#sidebar-avatar').textContent = initials(name);
    $('#header-user-name').textContent = `${name} · ${me.roleName || roleName(me.roleCode)}`;
    $('#header-user-chip')?.classList.remove('hidden');

    $('#nav-admin')?.classList.toggle('hidden', !hasAdminAccess());
    $('#btn-nuevo-informe')?.classList.toggle('hidden', !state.permissions.createReports);
    $('#btn-gestion-alumnos')?.classList.toggle('hidden', !state.permissions.manageStudents);

    const subtitles = {
      ALUMNO: 'Consulte sus informes y responda el descargo cuando esté habilitado.',
      TUTOR: 'Consulte los informes de los alumnos a su cargo.',
      ADMINISTRADOR: 'Supervisión administrativa y creación de informes. El descargo, la preceptoría, el PAT y el dictamen los completa cada rol responsable.',
      PROFESOR: 'Informes creados por usted. Sólo visualiza los alumnos de sus cursos asignados.',
      PRECEPTOR: 'Informes de los cursos asignados y observaciones de preceptoría.',
      PAT: 'Informes de los cursos asignados e intervenciones del PAT / Consejo de Aula.',
      DOE: 'Informes de los cursos asignados e intervenciones del DOE.',
      SECRETARIA: 'Consulta de informes de los cursos asignados, sin edición.',
      ASESORIA: 'Consulta de informes de los cursos asignados, sin edición.'
    };
    const subtitle = $('#informes-subtitle');
    if (subtitle) subtitle.textContent = subtitles[me.roleCode] || 'Registro institucional de situaciones escolares.';
  }

  async function loadAllData() {
    const results = await Promise.all([
      api.meta(),
      api.courses.list(),
      api.reports.list({ limit: 200 }),
      api.students.list(),
      api.notifications.list({ limit: 200 })
    ]);
    state.meta = results[0];
    state.roles = Array.isArray(results[0].roles) && results[0].roles.length ? results[0].roles : ROLE_FALLBACK;
    if (results[0].settings?.schoolName) state.schoolName = results[0].settings.schoolName;
    state.courses = results[1].courses || [];
    state.reports = results[2].reports || [];
    state.students = results[3].students || [];
    state.notifications = results[4].notifications || [];

    populateCourseFilters();
    populateAdminRoleFilter();
    renderReports();
    renderStudents();
    renderNotifications();
    renderAccount();
  }

  async function refreshNotifications() {
    try {
      const result = await api.notifications.list({ limit: 200 });
      state.notifications = result.notifications || [];
      renderNotifications();
    } catch (_) {
      // No interrumpe la operación principal.
    }
  }

  async function reloadSchoolData() {
    const [studentsResult, reportsResult] = await Promise.all([
      api.students.list(),
      api.reports.list({ limit: 200 })
    ]);
    state.students = studentsResult.students || [];
    state.reports = reportsResult.reports || [];

    if (hasAdminAccess()) {
      try {
        const adminStudents = await api.students.list({ include_inactive: 'true' });
        state.adminStudents = adminStudents.students || [];
        state.adminStudentsLoaded = true;
      } catch (_) {
        // La vista principal sigue funcionando aunque falle la carga administrativa.
      }
    }

    populateCourseFilters();
    renderReports();
    renderStudents();
    renderAccount();
    if (state.adminTab === 'alumnos') renderAdminStudents();
    if (state.adminTab === 'cursos') renderAdminCourses();

    if (state.selectedStudent && !$('#view-alumno-detalle')?.classList.contains('hidden')) {
      await showStudentDetail(state.selectedStudent.id);
    }
  }

  // ── Navegación ───────────────────────────────────────────────────
  function showSection(section) {
    if (section === 'admin' && !hasAdminAccess()) return;
    const sections = ['informes', 'alumnos', 'notificaciones', 'admin', 'ajustes'];
    if (!sections.includes(section)) return;

    sections.forEach(name => {
      document.getElementById(`section-${name}`)?.classList.toggle('visible', name === section);
    });
    $$('.nav-btn[data-section]').forEach(button => {
      button.classList.toggle('active', button.dataset.section === section);
    });

    if (section === 'alumnos') {
      $('#view-alumnos-lista')?.classList.remove('hidden');
      $('#view-alumno-detalle')?.classList.add('hidden');
      state.selectedStudent = null;
    }
    if (section === 'ajustes') renderAccount();
    if (section === 'admin') showAdminTab(state.adminTab || 'usuarios');

    closeSidebar();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function showAdminTab(tab) {
    if (!hasAdminAccess()) return;
    const tabs = ['usuarios', 'alumnos', 'cursos', 'configuracion', 'auditoria'];
    if (!tabs.includes(tab)) tab = 'usuarios';
    state.adminTab = tab;

    $$('#admin-tabs .tab-btn').forEach(button => {
      button.classList.toggle('active', button.dataset.adminTab === tab);
    });
    $$('.admin-panel').forEach(panel => panel.classList.add('hidden'));
    $(`#admin-panel-${tab}`)?.classList.remove('hidden');

    try {
      if (tab === 'usuarios') {
        await loadAdminUsers();
        renderAdminUsers();
      } else if (tab === 'alumnos') {
        await loadAdminStudents(true);
        renderAdminStudents();
      } else if (tab === 'cursos') {
        await loadCourses();
        await loadAdminStudents(false);
        renderAdminCourses();
      } else if (tab === 'configuracion') {
        await loadSettings();
      } else if (tab === 'auditoria') {
        await loadAudit();
      }
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
  }

  // ── Filtros / selects ───────────────────────────────────────────
  function setSelectOptions(selectId, items, placeholder, selected, valueGetter, labelGetter) {
    const select = document.getElementById(selectId);
    if (!select) return;
    const previous = selected !== undefined ? String(selected) : String(select.value || '');
    select.innerHTML = `<option value="">${esc(placeholder)}</option>`
      + items.map(item => {
        const value = valueGetter(item);
        return `<option value="${esc(value)}">${esc(labelGetter(item))}</option>`;
      }).join('');
    if (previous && items.some(item => String(valueGetter(item)) === previous)) select.value = previous;
    else select.value = '';
  }

  function populateCourseFilters() {
    const activeCourses = state.courses.filter(course => course.isActive !== false);
    setSelectOptions('filtro-curso', activeCourses, 'Todos los cursos', undefined,
      course => course.id, course => course.label);
    setSelectOptions('filtro-alumno-curso', activeCourses, 'Todos los cursos', undefined,
      course => course.id, course => course.label);
    setSelectOptions('admin-student-course', state.courses, 'Todos los cursos', undefined,
      course => course.id, course => `${course.label}${course.isActive === false ? ' (inactivo)' : ''}`);

    const divisions = [...new Set(state.courses.map(course => Number(course.division)))].filter(Boolean).sort((a, b) => a - b);
    setSelectOptions('admin-student-division', divisions.map(division => ({ division })), 'Todas las divisiones', undefined,
      item => item.division, item => `${item.division}° división`);
  }

  function populateAdminRoleFilter() {
    setSelectOptions('admin-user-role-filter', state.roles, 'Todos los roles', undefined,
      role => role.code, role => role.name);
  }

  // ── Informes ─────────────────────────────────────────────────────
  function getReportFilters() {
    return {
      q: norm($('#filtro-busqueda')?.value || ''),
      severity: $('#filtro-gravedad')?.value || '',
      courseId: $('#filtro-curso')?.value || '',
      stage: $('#filtro-etapa')?.value || ''
    };
  }

  function filteredReports() {
    const filters = getReportFilters();
    return state.reports.filter(report => {
      if (state.reportTab !== 'todos' && report.status !== state.reportTab) return false;
      if (filters.severity && report.severity !== filters.severity) return false;
      if (filters.courseId && Number(report.student.courseId) !== Number(filters.courseId)) return false;
      if (filters.stage && report.stage !== filters.stage) return false;
      if (filters.q) {
        const haystack = norm([
          report.student?.name,
          report.student?.dni,
          report.student?.course,
          report.issuer?.name,
          report.reason,
          report.description
        ].join(' '));
        if (!haystack.includes(filters.q)) return false;
      }
      return true;
    });
  }

  function renderReports() {
    const counts = {
      todos: state.reports.length,
      Pendiente: state.reports.filter(report => report.status === 'Pendiente').length,
      Resuelto: state.reports.filter(report => report.status === 'Resuelto').length,
      Anulado: state.reports.filter(report => report.status === 'Anulado').length
    };
    $('#tab-count-todos').textContent = counts.todos;
    $('#tab-count-pendiente').textContent = counts.Pendiente;
    $('#tab-count-resuelto').textContent = counts.Resuelto;
    $('#tab-count-anulado').textContent = counts.Anulado;
    $$('#informes-tabs .tab-btn').forEach(button => {
      button.classList.toggle('active', button.dataset.tab === state.reportTab);
    });

    renderOverview(counts);
    const reports = filteredReports();
    const list = $('#informes-list');
    const empty = $('#informes-empty');
    if (!list) return;
    list.innerHTML = reports.map(reportRowHtml).join('');
    list.classList.toggle('hidden', reports.length === 0);
    empty?.classList.toggle('hidden', reports.length > 0);
    $('#btn-nuevo-informe')?.classList.toggle('hidden', !state.permissions.createReports);
  }

  function renderOverview(counts) {
    const container = $('#informes-kpi-overview');
    if (!container) return;
    const total = counts.todos;
    const percent = value => total ? Math.max(value ? 4 : 0, Math.round((value / total) * 100)) : 0;
    container.innerHTML = `
      <div class="overview-dashboard">
        <div class="overview-total">
          <div class="overview-kicker">Informes visibles</div>
          <div class="overview-value">${total}</div>
          <div class="overview-caption">Según su rol y ámbito</div>
        </div>
        <div class="overview-breakdown">
          <div class="overview-row overview-pending">
            <div class="overview-row-head"><span class="overview-row-label">Pendientes</span><span class="overview-row-value">${counts.Pendiente}</span></div>
            <div class="overview-meter"><span style="width:${percent(counts.Pendiente)}%"></span></div>
          </div>
          <div class="overview-row overview-resolved">
            <div class="overview-row-head"><span class="overview-row-label">Resueltos</span><span class="overview-row-value">${counts.Resuelto}</span></div>
            <div class="overview-meter"><span style="width:${percent(counts.Resuelto)}%"></span></div>
          </div>
          <div class="overview-row overview-cancelled">
            <div class="overview-row-head"><span class="overview-row-label">Anulados</span><span class="overview-row-value">${counts.Anulado}</span></div>
            <div class="overview-meter"><span style="width:${percent(counts.Anulado)}%"></span></div>
          </div>
        </div>
      </div>`;
  }

  function reportRowHtml(report) {
    const can = report.can || {};
    const student = report.student || {};
    const actions = [];
    actions.push(`<button type="button" class="btn btn-outline btn-xs" data-report-action="detail" data-report-id="${report.id}">Ver detalle</button>`);
    if (can.canEdit) {
      actions.push(`<button type="button" class="btn btn-primary btn-xs" data-report-action="edit" data-report-id="${report.id}">${esc(can.editLabel || 'Editar')}</button>`);
    }
    if (can.canAnnul) {
      actions.push(`<button type="button" class="btn btn-warning btn-xs" data-report-action="annul" data-report-id="${report.id}">Anular</button>`);
    }
    if (can.canRevert) {
      actions.push(`<button type="button" class="btn btn-outline btn-xs" data-report-action="revert" data-report-id="${report.id}">Reactivar</button>`);
    }
    if (can.canDownload !== false) {
      actions.push(`<button type="button" class="btn btn-pdf btn-xs" data-report-action="pdf" data-report-id="${report.id}">PDF</button>`);
    }

    return `
      <article class="report-row" data-report-id="${report.id}">
        <div class="report-row-main">
          <div style="min-width:0; flex:1;">
            <h4>${esc(student.name || 'Alumno/a')}</h4>
            <div class="report-meta">${esc(student.course || 'Curso no informado')} · DNI ${esc(student.dni || '—')} · Informe N° ${report.id}</div>
            <div class="report-meta">Emitido el ${fmtDate(report.issueDate)}${report.issuer?.name ? ` por ${esc(report.issuer.name)}` : ''}</div>
            ${report.reason ? `<div class="report-reason"><strong>Motivo:</strong> ${esc(truncate(report.reason, 190))}</div>` : ''}
            ${can.statementOpen ? `<div class="form-warning" style="margin:8px 0 0; padding:5px 8px;">Descargo habilitado hasta ${fmtDate(report.statementDeadline)}.</div>` : ''}
          </div>
          <div style="text-align:right; min-width:150px;">
            <div><span class="status-badge ${statusClass(report.status)}">${esc(report.status)}</span> ${stageBadge(report.stage)}</div>
            <div style="margin-top:6px;">${severityBadge(report.severity)}</div>
            <div class="report-meta" style="margin-top:5px;">Última actualización<br>${fmtDateTime(report.updatedAt)}</div>
          </div>
        </div>
        <div class="report-row-actions">${actions.join('')}</div>
      </article>`;
  }

  function renderWorkflow(workflow) {
    const steps = Array.isArray(workflow) && workflow.length
      ? workflow
      : [
        { label: 'Creación', state: 'completed' },
        { label: 'Descargo', state: 'current' },
        { label: 'Consejos', state: 'pending' },
        { label: 'Dictamen', state: 'pending' },
        { label: 'Notificado', state: 'pending' }
      ];
    return steps.map(step => `<div class="workflow-step ${esc(step.state)}">${esc(step.label)}</div>`).join('');
  }

  async function showReportDetail(id) {
    try {
      const result = await api.reports.get(id);
      const report = result.report;
      state.currentReport = report;
      closeAllModals();
      renderReportDetail(report);
      openModal('modal-detalle');
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
  }

  function reportStudentHeader(student) {
    const s = student || {};
    return `
      <div class="modal-student-header">
        <div class="modal-avatar">${esc(initials(s.name))}</div>
        <div class="modal-student-info">
          <h4>${esc(s.name || 'Alumno/a')}</h4>
          <p>${esc(s.course || 'Curso no informado')} · DNI ${esc(s.dni || '—')}${s.legajo ? ` · Legajo ${esc(s.legajo)}` : ''}</p>
        </div>
      </div>`;
  }

  function hasDetailValue(field, report) {
    const prop = FIELD_PROPS[field];
    const value = report[prop];
    if (field === 'notify_student' || field === 'notify_parent') return value === true;
    return value !== undefined && value !== null && String(value).trim() !== '';
  }

  function detailFieldHtml(field, report) {
    const value = report[FIELD_PROPS[field]];
    if (field === 'notify_student' || field === 'notify_parent') {
      return `<div class="modal-field-box">${value ? 'Sí' : 'No'}</div>`;
    }
    if (field === 'severity') {
      return `<div class="modal-field-box">${esc(SEVERITY_LABELS[value] || value || '—')}</div>`;
    }
    if (field === 'director_date' || field === 'issue_date') {
      return `<div class="modal-field-box">${fmtDate(value)}</div>`;
    }
    const className = field === 'student_text' ? 'modal-field-box student-text' : 'modal-field-box';
    return `<div class="${className}">${esc(value)}</div>`;
  }

  function renderReportDetail(report) {
    $('#modal-detalle-title').textContent = `Informe N° ${report.id} · ${report.status}`;
    const readable = new Set(report.form?.readableFields || []);
    const sections = [];

    REPORT_SECTIONS.forEach(section => {
      const visible = section.fields.filter(field => {
        if (!readable.has(field)) return false;
        return hasDetailValue(field, report);
      });
      if (!visible.length) return;
      const fields = visible.map(field => `
        <div class="modal-section-title">${esc(FIELD_LABELS[field] || field)}</div>
        ${detailFieldHtml(field, report)}`).join('');
      sections.push(`<div style="margin-top:16px;"><h4 style="font-size:.82rem; color:var(--azul-institucional-oscuro); margin-bottom:6px;">${esc(section.title)}</h4>${fields}</div>`);
    });

    const meta = [
      ['Emisor', `${report.issuer?.name || '—'}${report.issuer?.role ? ` · ${report.issuer.role}` : ''}`],
      ['Fecha de emisión', fmtDate(report.issueDate)],
      ['Etapa actual', STAGE_LABELS[report.stage] || report.stage || '—'],
      ['Plazo de descargo', report.statementDeadline ? fmtDate(report.statementDeadline) : '—'],
      ['Descargo presentado', report.statementSubmittedAt ? fmtDateTime(report.statementSubmittedAt) : '—'],
      ['Última actualización', fmtDateTime(report.updatedAt)]
    ];
    if (report.creatorName) meta.push(['Creado por', report.creatorName]);
    if (report.previousStatus) meta.push(['Estado anterior', report.previousStatus]);

    const history = Array.isArray(report.history) && report.history.length
      ? `<div style="margin-top:20px;">
          <div class="modal-section-title">Historial del informe</div>
          ${report.history.map(item => `
            <div class="report-history-item">
              <div class="report-history-item-header">
                <h5>${esc(item.action)}</h5>
                <span class="small muted">${fmtDateTime(item.createdAt)}</span>
              </div>
              <p>${esc(item.actorName || 'Sistema')}${item.actorRole ? ` · ${esc(item.actorRole)}` : ''}</p>
              ${item.description ? `<p style="margin-top:4px;">${esc(item.description)}</p>` : ''}
            </div>`).join('')}
        </div>`
      : '';

    const annulled = report.status === 'Anulado'
      ? '<div class="form-warning" style="margin-bottom:14px;">Este informe está anulado. Se conserva únicamente por trazabilidad institucional.</div>'
      : '';

    const signature = report.directorSignatureImage
      ? `<div style="margin-top:16px;">
          <div class="modal-section-title">Firma de la autoridad</div>
          <div class="signature-preview"><img src="${esc(report.directorSignatureImage)}" alt="Firma de la autoridad competente"></div>
        </div>`
      : '';

    $('#detalle-content').innerHTML = `
      ${reportStudentHeader(report.student)}
      <div class="modal-badges-row">
        <span class="status-badge ${statusClass(report.status)}">${esc(report.status)}</span>
        ${stageBadge(report.stage)}
        ${severityBadge(report.severity)}
      </div>
      ${annulled}
      <div class="workflow-indicator compact" style="margin:4px 0 16px;">${renderWorkflow(report.workflow)}</div>
      <div class="modal-meta-grid">
        ${meta.map(([label, value]) => `<div class="modal-meta-cell"><div class="meta-label">${esc(label)}</div><div class="meta-val">${esc(value)}</div></div>`).join('')}
      </div>
      ${sections.join('') || '<p class="empty-inline">No hay campos adicionales visibles para su rol.</p>'}
      ${signature}
      ${history}`;

    const can = report.can || {};
    const footer = [`<button type="button" class="btn btn-secondary" data-close-modal="modal-detalle">Cerrar</button>`];
    if (can.canDownload !== false) {
      footer.push(`<button type="button" class="btn btn-pdf" data-report-action="pdf" data-report-id="${report.id}">Descargar PDF</button>`);
    }
    if (can.canEdit) {
      footer.push(`<button type="button" class="btn btn-primary" data-report-action="edit" data-report-id="${report.id}">${esc(can.editLabel || 'Editar')}</button>`);
    }
    if (can.canAnnul) {
      footer.push(`<button type="button" class="btn btn-warning" data-report-action="annul" data-report-id="${report.id}">Anular informe</button>`);
    }
    if (can.canRevert) {
      footer.push(`<button type="button" class="btn btn-outline" data-report-action="revert" data-report-id="${report.id}">Reactivar informe</button>`);
    }
    $('#detalle-footer').innerHTML = footer.join('');
  }

  function reportSummaryById(id) {
    return state.reports.find(report => Number(report.id) === Number(id)) || null;
  }

  async function handleReportAction(action, id) {
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) return;

    if (action === 'detail') {
      await showReportDetail(numericId);
      return;
    }
    if (action === 'edit') {
      await openReportForm(numericId);
      return;
    }
    if (action === 'pdf') {
      await downloadReportPdf(numericId);
      return;
    }
    if (action === 'annul') {
      const summary = reportSummaryById(numericId);
      const motivo = window.prompt(`Motivo de anulación del informe N° ${numericId}:`);
      if (motivo === null) return;
      if (motivo.trim().length < 5) {
        toast('Indique un motivo de al menos 5 caracteres.', 'error');
        return;
      }
      if (!window.confirm('¿Confirma la anulación? El informe se conservará en el historial institucional.')) return;
      try {
        await api.reports.annul(numericId, motivo.trim());
        closeAllModals();
        await reloadSchoolData();
        await refreshNotifications();
        toast(`Informe N° ${numericId} anulado.`, 'success');
      } catch (error) {
        toast(errorMessage(error), 'error');
      }
      return;
    }
    if (action === 'revert') {
      if (!window.confirm('¿Reactivar este informe anulado? Se restaurará su estado anterior.')) return;
      try {
        await api.reports.revert(numericId);
        closeAllModals();
        await reloadSchoolData();
        await refreshNotifications();
        toast(`Informe N° ${numericId} reactivado.`, 'success');
      } catch (error) {
        toast(errorMessage(error), 'error');
      }
    }
  }

  async function downloadReportPdf(id) {
    try {
      const result = await api.reports.get(id);
      window.ET35.pdf.report(result.report, { schoolName: state.schoolName, staff: isStaff() });
      toast('PDF generado.', 'success');
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
  }

  // ── Formulario de informe ───────────────────────────────────────
  async function openReportForm(id) {
    try {
      let report = null;
      if (id) {
        const result = await api.reports.get(id);
        report = result.report;
        if (!report.can?.canEdit) {
          await showReportDetail(id);
          return;
        }
      }
      closeAllModals();
      state.editingReport = report;
      renderReportForm(report);
      openModal('modal-informe');
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
  }

  function studentOptionLabel(student) {
    return `${student.name} · ${student.course} · DNI ${student.dni}`;
  }

  function buildStudentOptions(search = '') {
    const term = norm(search);
    return state.students
      .filter(student => !term || norm(`${student.name} ${student.dni} ${student.course}`).includes(term))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'))
      .map(student => `<option value="${student.id}">${esc(studentOptionLabel(student))}</option>`)
      .join('');
  }

  function renderReportForm(report) {
    const isCreate = !report;
    const modal = $('#modal-informe');
    $('#edit-report-id').value = isCreate ? '' : report.id;
    $('#modal-informe-title').textContent = isCreate ? 'Nuevo informe de convivencia' : (report.can?.editLabel || 'Editar informe');
    $('#modal-informe-subtitle').textContent = isCreate
      ? 'Complete el hecho y seleccione el alumno.'
      : `Informe N° ${report.id} · ${report.student?.name || ''} · ${report.student?.course || ''}`;

    const hint = $('#modal-role-hint');
    let hintText = '';
    if (isCreate) {
      hintText = `El informe se registrará a nombre de ${state.me.fullName} (${state.me.roleName || roleName(state.me.roleCode)}). ` +
        'Sólo verá los alumnos de los cursos asignados a su rol.';
    } else if (state.me.roleCode === 'ALUMNO') {
      hintText = `Descargo habilitado${report.statementDeadline ? ` hasta el ${fmtDate(report.statementDeadline)}` : ''}. ` +
        'Al enviarlo, el informe avanzará a la etapa de consejos y el texto no podrá editarse.';
    } else if (state.me.roleCode === 'PRECEPTOR') {
      hintText = 'Sólo se habilitan las observaciones de preceptoría. Los demás campos son de lectura.';
    } else if (['PAT', 'DOE'].includes(state.me.roleCode)) {
      hintText = 'Sólo se habilita el informe PAT / Consejo de Aula. Los demás campos son de lectura.';
    } else if (['RECTOR', 'VICERRECTOR', 'REGENTE', 'SUBREGENTE', 'JEFE_TALLER'].includes(state.me.roleCode)) {
      hintText = 'Puede completar el dictamen. Si indica la fecha del dictamen, el informe quedará Resuelto y se registrarán las notificaciones seleccionadas.';
    } else {
      hintText = 'Sólo se muestran los campos que su rol puede leer; los editables están habilitados.';
    }
    hint.textContent = hintText;
    hint.classList.remove('hidden');

    const warning = $('#modal-form-warning');
    if (report && report.status !== 'Pendiente') {
      warning.textContent = 'Este informe ya no admite modificaciones.';
      warning.classList.remove('hidden');
    } else {
      warning.classList.add('hidden');
    }

    $('#modal-workflow').innerHTML = renderWorkflow(report?.workflow);

    const editable = isCreate ? CREATION_FIELDS : (report.form?.editableFields || []);
    state.formFields = editable;
    $('#form-sections').innerHTML = isCreate
      ? renderCreateReportSections()
      : renderEditReportSections(report, editable);

    signaturePad = null;
    requestAnimationFrame(() => setupSignaturePad(report?.directorSignatureImage || null));

    const submit = $('#submitBtn');
    if (isCreate) submit.textContent = 'Crear informe';
    else if (state.me.roleCode === 'ALUMNO') submit.textContent = 'Enviar descargo';
    else if (state.me.roleCode === 'PRECEPTOR') submit.textContent = 'Guardar observaciones';
    else if (['PAT', 'DOE'].includes(state.me.roleCode)) submit.textContent = 'Guardar informe PAT';
    else if (['RECTOR', 'VICERRECTOR', 'REGENTE', 'SUBREGENTE', 'JEFE_TALLER'].includes(state.me.roleCode)) submit.textContent = 'Guardar dictamen';
    else submit.textContent = 'Guardar cambios';

    const reset = $('#btn-form-reset');
    if (reset) reset.classList.toggle('hidden', !isCreate && !report);
    $('#form-message').innerHTML = '';
    const disabled = isCreate && state.students.length === 0;
    submit.disabled = disabled;
    if (disabled) {
      setMessage('form-message', 'error', 'No hay alumnos activos dentro de su ámbito. Contacte a la administración.');
    }

    if (isCreate) {
      const search = $('#form-student-search');
      const select = $('#form-student-select');
      if (search && select) {
        select.innerHTML = `<option value="" disabled selected>Seleccione un alumno…</option>${buildStudentOptions()}`;
        search.addEventListener('input', () => {
          const current = select.value;
          select.innerHTML = `<option value="" disabled>Seleccione un alumno…</option>${buildStudentOptions(search.value)}`;
          if ([...select.options].some(option => option.value === current)) select.value = current;
        }, { once: false });
      }
    }

    modal.dataset.mode = isCreate ? 'create' : 'edit';
  }

  function setupSignaturePad(existingData) {
    const canvas = $('#signature-pad');
    signaturePad = null;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width || 600));
    const height = Math.max(1, Math.round(rect.height || 170));
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';

    const pad = {
      canvas,
      ctx,
      width,
      height,
      drawing: false,
      dirty: false,
      hasInk: Boolean(existingData),
      existing: existingData || null
    };
    signaturePad = pad;

    const status = $('#signature-status');
    const updateStatus = () => {
      if (!status) return;
      status.textContent = pad.hasInk
        ? 'Firma lista para incluir en el PDF.'
        : 'Dibuje la firma dentro del recuadro.';
      status.classList.toggle('signed', pad.hasInk);
    };
    updateStatus();

    if (existingData) {
      const img = new Image();
      img.onload = () => {
        if (pad.dirty) return;
        try {
          const scale = Math.min(width / img.width, height / img.height);
          const w = img.width * scale;
          const h = img.height * scale;
          ctx.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
        } catch (_) {
          // Si la imagen no se puede dibujar, se conserva el data URL existente.
        }
      };
      img.src = existingData;
    }

    const point = event => {
      const bounds = canvas.getBoundingClientRect();
      return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    };

    canvas.addEventListener('pointerdown', event => {
      if (event.button !== undefined && event.button !== 0) return;
      event.preventDefault();
      pad.drawing = true;
      pad.dirty = true;
      pad.hasInk = true;
      const p = point(event);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + 0.01, p.y + 0.01);
      ctx.stroke();
      updateStatus();
      if (canvas.setPointerCapture) {
        try { canvas.setPointerCapture(event.pointerId); } catch (_) {}
      }
    });

    canvas.addEventListener('pointermove', event => {
      if (!pad.drawing) return;
      event.preventDefault();
      const p = point(event);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    });

    const endStroke = event => {
      if (!pad.drawing) return;
      event.preventDefault();
      pad.drawing = false;
      ctx.beginPath();
    };
    canvas.addEventListener('pointerup', endStroke);
    canvas.addEventListener('pointercancel', endStroke);
    canvas.addEventListener('pointerleave', endStroke);

    $('#signature-clear')?.addEventListener('click', () => {
      ctx.clearRect(0, 0, width, height);
      pad.dirty = true;
      pad.hasInk = false;
      pad.existing = null;
      updateStatus();
    });
  }

  function signatureHasInk() {
    return Boolean(signaturePad && signaturePad.hasInk);
  }

  function currentSignatureData() {
    if (!signaturePad) return '';
    if (signaturePad.dirty) {
      return signaturePad.hasInk ? signaturePad.canvas.toDataURL('image/png') : '';
    }
    return signaturePad.existing || '';
  }

  function renderCreateReportSections() {
    return `
      <div class="section-block">
        <h3>Alumno/a</h3>
        <div class="form-group">
          <label for="form-student-search">Buscar alumno</label>
          <input type="text" id="form-student-search" placeholder="Nombre, DNI o curso…" autocomplete="off">
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label for="form-student-select">Seleccione el legajo *</label>
          <select id="form-student-select" size="7" required></select>
          <p class="form-help">Sólo se listan alumnos activos de su ámbito autorizado.</p>
        </div>
      </div>
      <div class="section-block">
        <h3>Hecho informado</h3>
        <div class="form-group">
          <label for="field-reason">Motivo *</label>
          <input type="text" id="field-reason" maxlength="300" required placeholder="Síntesis breve del hecho">
        </div>
        <div class="form-group">
          <label for="field-description">Descripción del hecho *</label>
          <textarea id="field-description" rows="5" maxlength="5000" required placeholder="Describa lo ocurrido con precisión y sin datos innecesarios."></textarea>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label for="field-issue_date">Fecha de emisión *</label>
          <input type="date" id="field-issue_date" max="${todayInput()}" value="${todayInput()}" required>
          <p class="form-help">La fecha no puede ser futura.</p>
        </div>
      </div>`;
  }

  function editableFieldHtml(field, report) {
    const value = report ? report[FIELD_PROPS[field]] : '';
    const label = FIELD_LABELS[field] || field;
    if (field === 'severity') {
      const options = ['LEVE', 'GRAVE', 'MUY GRAVE', 'SUSPENSO'].map(option => `
        <label class="radio-option"><input type="radio" name="field-severity" value="${option}" ${value === option ? 'checked' : ''}> ${esc(SEVERITY_LABELS[option])}</label>`).join('');
      return `<div class="form-group"><label>${esc(label)} *</label><div class="radio-group">${options}</div></div>`;
    }
    if (field === 'notify_student' || field === 'notify_parent') {
      return `<div class="form-group"><label class="checkbox-line"><input type="checkbox" id="field-${field}" ${value ? 'checked' : ''}> ${esc(label)}</label></div>`;
    }
    if (field === 'issue_date' || field === 'director_date') {
      return `<div class="form-group"><label for="field-${field}">${esc(label)}${field === 'issue_date' ? ' *' : ''}</label>
        <input type="date" id="field-${field}" value="${esc(dateValue(value))}" max="${todayInput()}" ${field === 'issue_date' ? 'required' : ''}></div>`;
    }
    if (field === 'reason') {
      return `<div class="form-group"><label for="field-reason">${esc(label)} *</label>
        <input type="text" id="field-reason" maxlength="300" value="${esc(value || '')}" required></div>`;
    }
    if (field === 'description' || field === 'student_text') {
      return `<div class="form-group"><label for="field-${field}">${esc(label)} *</label>
        <textarea id="field-${field}" rows="${field === 'description' ? 5 : 6}" maxlength="5000" required>${esc(value || '')}</textarea>
        ${field === 'student_text' ? '<p class="form-help">Al enviar el descargo no podrá modificar este texto.</p>' : ''}</div>`;
    }
    if (field === 'council_notes' || field === 'additional_notes' || field === 'preceptor_notes' || field === 'pat_notes') {
      return `<div class="form-group"><label for="field-${field}">${esc(label)}</label>
        <textarea id="field-${field}" rows="3" maxlength="5000">${esc(value || '')}</textarea></div>`;
    }
    if (field === 'other_considerations') {
      return `<div class="form-group"><label for="field-other_considerations">${esc(label)}</label>
        <textarea id="field-other_considerations" rows="3" maxlength="1000">${esc(value || '')}</textarea></div>`;
    }
    return '';
  }

  function readonlyFieldHtml(field, report) {
    const value = report[FIELD_PROPS[field]];
    let display;
    if (field === 'notify_student' || field === 'notify_parent') display = value ? 'Sí' : 'No';
    else if (field === 'severity') display = SEVERITY_LABELS[value] || value;
    else if (field === 'director_date' || field === 'issue_date') display = fmtDate(value);
    else display = value;
    return `<div class="form-group"><label>${esc(FIELD_LABELS[field] || field)}</label>
      <div class="field-readonly">${esc(display || '—')}</div></div>`;
  }

  function renderEditReportSections(report, editable) {
    const readable = new Set(report.form?.readableFields || []);
    let html = reportStudentHeader(report.student);
    REPORT_SECTIONS.forEach(section => {
      const fields = section.fields.filter(field => {
        if (!readable.has(field)) return false;
        if (editable.includes(field)) return true;
        return hasDetailValue(field, report);
      });
      if (!fields.length) return;
      html += `<div class="section-block"><h3>${esc(section.title)}</h3>`;
      fields.forEach(field => {
        html += editable.includes(field) ? editableFieldHtml(field, report) : readonlyFieldHtml(field, report);
      });
      html += '</div>';
    });

    if (editable.includes('director_signature_image')) {
      html += `
        <div class="section-block signature-block">
          <h3>Firma de la autoridad</h3>
          <p class="form-help">Dibuje su firma con el mouse o el dedo. Se incluirá en el PDF al finalizar el informe.</p>
          <div class="signature-pad-shell">
            <canvas id="signature-pad" class="signature-pad" aria-label="Firma de la autoridad competente"></canvas>
          </div>
          <div class="signature-actions">
            <button type="button" class="btn btn-outline btn-sm" id="signature-clear">Limpiar firma</button>
            <span id="signature-status" class="signature-status">Dibuje la firma dentro del recuadro.</span>
          </div>
        </div>`;
    }
    return html;
  }

  function getFieldValue(field) {
    if (field === 'director_signature_image') return currentSignatureData();
    if (field === 'severity') {
      return $(`input[name="field-severity"]:checked`)?.value || '';
    }
    if (field === 'notify_student' || field === 'notify_parent') {
      return Boolean($(`#field-${field}`)?.checked);
    }
    return $(`#field-${field}`)?.value ?? '';
  }

  async function submitReportForm(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;

    const isCreate = !state.editingReport;
    const payload = {};
    for (const field of state.formFields) {
      payload[field] = getFieldValue(field);
    }

    if (isCreate) {
      const studentId = Number($('#form-student-select')?.value);
      if (!studentId) {
        setMessage('form-message', 'error', 'Seleccione un alumno para el informe.');
        return;
      }
      payload.student_id = studentId;
    }

    if (!isCreate && state.formFields.includes('student_text')) {
      if (!window.confirm('¿Confirma el envío del descargo? Una vez enviado no podrá modificarlo.')) return;
    }
    const finalizing = !isCreate && Boolean(payload.director_date);
    if (!isCreate && state.formFields.includes('director_signature_image') && finalizing && !signatureHasInk()) {
      setMessage('form-message', 'error', 'Dibuje la firma de la autoridad antes de finalizar el informe.');
      return;
    }
    if ('director_signature_image' in payload && !payload.director_signature_image) {
      delete payload.director_signature_image;
    }
    if (!isCreate && state.formFields.includes('director_date') && payload.director_date) {
      if (!window.confirm('Al guardar con fecha de dictamen, el informe quedará Resuelto y se registrarán las notificaciones marcadas. ¿Confirma?')) return;
    }

    const button = $('#submitBtn');
    button.disabled = true;
    setMessage('form-message', '', '');
    try {
      let result;
      if (isCreate) {
        result = await api.reports.create(payload);
        toast('Informe creado correctamente.', 'success');
      } else {
        result = await api.reports.update(state.editingReport.id, payload);
        toast(finalizing ? 'Informe finalizado correctamente.' : 'Informe actualizado correctamente.', 'success');
      }
      closeAllModals();
      await reloadSchoolData();
      await refreshNotifications();
      if (finalizing && result?.report) {
        try {
          window.ET35.pdf.report(result.report, { schoolName: state.schoolName, staff: isStaff() });
          toast('PDF generado con la firma.', 'success');
        } catch (pdfError) {
          toast(`El informe se guardó, pero no se pudo generar el PDF: ${pdfError.message}`, 'error');
        }
      }
    } catch (error) {
      setMessage('form-message', 'error', errorMessage(error));
    } finally {
      button.disabled = false;
    }
  }

  // ── Alumnos ──────────────────────────────────────────────────────
  function filteredStudents() {
    const query = norm($('#filtro-alumno-busqueda')?.value || '');
    const courseId = $('#filtro-alumno-curso')?.value || '';
    const order = $('#filtro-alumno-orden')?.value || 'apellido';
    const list = state.students.filter(student => {
      if (courseId && Number(student.courseId) !== Number(courseId)) return false;
      if (query && !norm(`${student.name} ${student.dni} ${student.legajo || ''} ${student.course}`).includes(query)) return false;
      return true;
    });
    list.sort((a, b) => {
      if (order === 'curso') {
        return `${a.course} ${a.lastName} ${a.firstName}`.localeCompare(`${b.course} ${b.lastName} ${b.firstName}`, 'es');
      }
      if (order === 'informes') {
        return (b.counts?.total || 0) - (a.counts?.total || 0) || a.lastName.localeCompare(b.lastName, 'es');
      }
      return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'es');
    });
    return list;
  }

  function renderStudents() {
    const grid = $('#alumnos-grid');
    if (!grid) return;
    const students = filteredStudents();
    if (!students.length) {
      grid.innerHTML = `<div class="students-table-header"><span>Alumno</span><span>Curso</span><span>DNI</span><span>Leve</span><span>Grave</span><span>Total</span><span></span></div>`;
      $('#alumnos-empty')?.classList.remove('hidden');
      return;
    }
    $('#alumnos-empty')?.classList.add('hidden');
    grid.innerHTML = `
      <div class="students-table-header">
        <span>Alumno</span><span>Curso</span><span>DNI</span><span>Leve</span><span>Grave</span><span>Total</span><span></span>
      </div>
      ${students.map(student => {
        const counts = student.counts || {};
        return `
          <div class="student-card" data-student-id="${student.id}" tabindex="0" role="button" aria-label="Ver legajo de ${esc(student.name)}">
            <div class="student-card-name-cell">
              <div class="student-avatar">${esc(initials(student.name))}</div>
              <div class="student-card-info">
                <h4>${esc(student.name)}</h4>
                <p>${esc(student.legajo ? `Legajo ${student.legajo}` : 'Sin legajo')}${student.isActive === false ? ' · INACTIVO' : ''}</p>
              </div>
            </div>
            <div class="student-col-value">${esc(student.course)}</div>
            <div class="student-col-value dni">${esc(student.dni)}</div>
            <div><span class="sev-dot" style="background:#d6c74e;"></span><span class="sev-count leve-c ${counts.leve ? '' : 'zero'}">${counts.leve || 0}</span></div>
            <div><span class="sev-dot" style="background:#c0392b;"></span><span class="sev-count grave-c ${counts.grave ? '' : 'zero'}">${counts.grave || 0}</span></div>
            <div><span class="sev-count total-c ${counts.total ? '' : 'zero'}">${counts.total || 0}</span></div>
            <div class="student-row-action"><button type="button" class="btn-ver-detalle" data-student-open="${student.id}">Ver detalle</button></div>
          </div>`;
      }).join('')}`;
  }

  async function showStudentDetail(id) {
    try {
      const result = await api.students.get(id);
      const student = result.student;
      const listStudent = state.students.find(item => Number(item.id) === Number(id));
      if (listStudent?.counts) student.counts = listStudent.counts;
      state.selectedStudent = student;
      const reports = state.reports.filter(report => Number(report.student?.id) === Number(id));
      const counts = student.counts || { total: reports.length };
      const canManage = state.permissions.manageStudents;

      $('#view-alumnos-lista')?.classList.add('hidden');
      $('#view-alumno-detalle')?.classList.remove('hidden');
      $('#alumno-detalle-content').innerHTML = `
        <div class="student-detail-strip">
          <div class="student-avatar-lg">${esc(initials(student.name))}</div>
          <div class="student-detail-info">
            <h2>${esc(student.name)}</h2>
            <p>${esc(student.course)}</p>
            <div class="detail-sub">
              <span class="detail-chip">DNI ${esc(student.dni)}</span>
              ${student.legajo ? `<span class="detail-chip">Legajo ${esc(student.legajo)}</span>` : ''}
              <span class="detail-chip">${esc(student.shift || 'Turno no informado')}</span>
            </div>
          </div>
        </div>
        <div class="kpi-section-label">Datos del legajo</div>
        <div class="alumno-ficha">
          <div class="alumno-ficha-field"><div class="field-label">Curso</div><div class="field-val">${esc(student.course)}</div></div>
          <div class="alumno-ficha-field"><div class="field-label">Año / división</div><div class="field-val">${student.year}° / ${student.division}°</div></div>
          <div class="alumno-ficha-field"><div class="field-label">Especialidad</div><div class="field-val">${esc(student.specialty)}</div></div>
          <div class="alumno-ficha-field"><div class="field-label">Turno</div><div class="field-val">${esc(student.shift || '—')}</div></div>
          <div class="alumno-ficha-field"><div class="field-label">Correo de contacto</div><div class="field-val">${esc(student.email || 'No informado')}</div></div>
          <div class="alumno-ficha-field"><div class="field-label">Correo del adulto responsable</div><div class="field-val">${esc(student.guardianEmail || 'No informado')}</div></div>
        </div>
        <div class="kpi-section-label">Resumen de convivencia</div>
        <div class="kpi-cards">
          <div class="kpi-card"><div class="kpi-label">Total</div><div class="kpi-value">${counts.total || 0}</div></div>
          <div class="kpi-card kpi-pending"><div class="kpi-label">Pendientes</div><div class="kpi-value">${counts.pendiente || 0}</div></div>
          <div class="kpi-card kpi-resolved"><div class="kpi-label">Resueltos</div><div class="kpi-value">${counts.resuelto || 0}</div></div>
          <div class="kpi-card"><div class="kpi-label">Leves</div><div class="kpi-value">${counts.leve || 0}</div></div>
          <div class="kpi-card"><div class="kpi-label">Graves</div><div class="kpi-value">${counts.grave || 0}</div></div>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin:16px 0;">
          <button type="button" class="btn btn-primary" data-student-action="history" data-student-id="${student.id}">Historial completo</button>
          <button type="button" class="btn btn-pdf" data-student-action="pdf" data-student-id="${student.id}">Descargar legajo PDF</button>
          ${canManage ? `<button type="button" class="btn btn-outline" data-student-action="edit" data-student-id="${student.id}">Editar legajo</button>` : ''}
        </div>
        <div class="kpi-section-label">Informes visibles</div>
        <div id="alumno-report-list">${reports.length ? reports.map(reportRowHtml).join('') : '<div class="empty-inline">Sin informes visibles para su rol.</div>'}</div>`;
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
  }

  async function openStudentHistory(student) {
    try {
      const result = await api.reports.list({ student_id: student.id, limit: 200 });
      const reports = result.reports || [];
      state.historyStudent = student;
      state.historyReports = reports;
      const counts = {
        total: reports.length,
        pending: reports.filter(report => report.status === 'Pendiente').length,
        resolved: reports.filter(report => report.status === 'Resuelto').length,
        annulled: reports.filter(report => report.status === 'Anulado').length
      };
      $('#modal-historial-title').textContent = `Historial de ${student.name}`;
      $('#historial-content').innerHTML = `
        <div class="modal-student-header">
          <div class="modal-avatar">${esc(initials(student.name))}</div>
          <div class="modal-student-info">
            <h4>${esc(student.name)}</h4>
            <p>${esc(student.course)} · DNI ${esc(student.dni)}</p>
          </div>
        </div>
        <div class="kpi-cards">
          <div class="kpi-card"><div class="kpi-label">Informes</div><div class="kpi-value">${counts.total}</div></div>
          <div class="kpi-card kpi-pending"><div class="kpi-label">Pendientes</div><div class="kpi-value">${counts.pending}</div></div>
          <div class="kpi-card kpi-resolved"><div class="kpi-label">Resueltos</div><div class="kpi-value">${counts.resolved}</div></div>
          <div class="kpi-card kpi-annulled"><div class="kpi-label">Anulados</div><div class="kpi-value">${counts.annulled}</div></div>
        </div>
        ${reports.length ? reports.map(reportRowHtml).join('') : '<div class="empty-inline">Sin informes registrados.</div>'}`;
      const pdfButton = $('#btn-history-pdf');
      if (pdfButton) pdfButton.disabled = reports.length === 0;
      openModal('modal-historial');
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
  }

  function downloadStudentHistory() {
    if (!state.historyStudent) return;
    try {
      window.ET35.pdf.studentHistory(state.historyStudent, state.historyReports, { schoolName: state.schoolName });
      toast('Legajo PDF generado.', 'success');
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
  }

  // ── Administración: usuarios ────────────────────────────────────
  async function loadAdminUsers() {
    const result = await api.users.list();
    state.users = result.users || [];
    populateAdminRoleFilter();
    renderAdminUsers();
  }

  function filteredAdminUsers() {
    const query = norm($('#admin-user-search')?.value || '');
    const roleCode = $('#admin-user-role-filter')?.value || '';
    const status = $('#admin-user-status-filter')?.value || '';
    return state.users.filter(user => {
      if (roleCode && user.roleCode !== roleCode) return false;
      if (status === 'active' && !user.isActive) return false;
      if (status === 'inactive' && user.isActive) return false;
      if (query && !norm(`${user.fullName} ${user.email} ${user.roleName} ${user.roleCode}`).includes(query)) return false;
      return true;
    });
  }

  function assignmentLabel(user) {
    if (user.roleCode === 'ADMINISTRADOR') return 'Acceso total';
    if (user.roleCode === 'ALUMNO') return user.student ? `Alumno: ${user.student.name} · DNI ${user.student.dni}` : 'Sin legajo vinculado';
    if (user.roleCode === 'TUTOR') {
      return user.tutorStudents?.length
        ? `A cargo: ${user.tutorStudents.map(student => student.name).join(', ')}`
        : 'Sin alumnos vinculados';
    }
    if (user.scopeAll) return 'Ámbito global';
    return user.courses?.length ? user.courses.map(course => course.label).join(', ') : 'Sin cursos asignados';
  }

  function renderAdminUsers() {
    const tbody = $('#admin-users-tbody');
    if (!tbody) return;
    const users = filteredAdminUsers();
    tbody.innerHTML = users.map(user => `
      <tr>
        <td>
          <strong>${esc(user.fullName)}</strong><br>
          <span class="small muted">${esc(user.email)}</span>
          ${user.mustChangePassword ? '<br><span class="small" style="color:#92400e;">Cambio de contraseña pendiente</span>' : ''}
        </td>
        <td><span class="badge-role">${esc(user.roleName)}</span></td>
        <td class="small">${esc(assignmentLabel(user))}</td>
        <td>
          <span class="status-badge ${user.isActive ? 'status-resuelto' : 'status-anulado'}">${user.isActive ? 'Activa' : 'Inactiva'}</span>
          <div class="small muted" style="margin-top:3px;">${user.lastLoginAt ? `Último acceso: ${fmtDateTime(user.lastLoginAt)}` : 'Sin ingresos'}</div>
        </td>
        <td>
          <div class="student-table-actions">
            <button type="button" class="btn btn-outline btn-xs" data-user-action="edit" data-user-id="${esc(user.id)}">Editar</button>
            <button type="button" class="btn btn-outline btn-xs" data-user-action="reset" data-user-id="${esc(user.id)}">Contraseña</button>
            ${user.isActive && user.id !== state.me.id ? `<button type="button" class="btn btn-warning btn-xs" data-user-action="deactivate" data-user-id="${esc(user.id)}">Desactivar</button>` : ''}
            ${!user.isActive ? `<button type="button" class="btn btn-success btn-xs" data-user-action="activate" data-user-id="${esc(user.id)}">Activar</button>` : ''}
          </div>
        </td>
      </tr>`).join('');
    $('#admin-users-empty')?.classList.toggle('hidden', users.length > 0);
  }

  async function openUserModal(user) {
    try {
      await loadCourses();
      if (!state.adminStudentsLoaded) await loadAdminStudents(true);
      const isEdit = Boolean(user);
      $('#modal-usuario-title').textContent = isEdit ? 'Editar cuenta' : 'Nueva cuenta';
      $('#usuario-id').value = isEdit ? user.id : '';
      $('#usuario-nombre').value = isEdit ? user.fullName : '';
      $('#usuario-email').value = isEdit ? user.email : '';
      $('#usuario-password').value = '';
      $('#usuario-password-group').classList.toggle('hidden', isEdit);
      $('#usuario-active-group').classList.toggle('hidden', !isEdit);
      $('#usuario-active').checked = isEdit ? user.isActive : true;
      $('#usuario-scope-all').checked = isEdit ? Boolean(user.scopeAll) : false;

      const roles = state.roles.length ? state.roles : ROLE_FALLBACK;
      $('#usuario-rol').innerHTML = roles.map(role => `<option value="${esc(role.code)}">${esc(role.name)}</option>`).join('');
      $('#usuario-rol').value = isEdit ? user.roleCode : 'PROFESOR';

      $('#usuario-cursos').innerHTML = state.courses
        .filter(course => course.isActive !== false)
        .map(course => `<label class="assignment-option"><input type="checkbox" name="user-course" value="${course.id}" ${user?.courseIds?.includes(course.id) ? 'checked' : ''}> ${esc(course.label)}</label>`)
        .join('') || '<span class="empty-inline">No hay cursos activos.</span>';

      const activeStudents = state.adminStudents.filter(student => student.isActive);
      $('#usuario-alumno').innerHTML = `<option value="">Seleccione un legajo…</option>` + activeStudents
        .map(student => `<option value="${student.id}" ${user?.studentId === student.id ? 'selected' : ''}>${esc(student.name)} · DNI ${esc(student.dni)} · ${esc(student.course)}</option>`)
        .join('');
      $('#usuario-tutores').innerHTML = activeStudents
        .map(student => `<label class="assignment-option"><input type="checkbox" name="user-tutor-student" value="${student.id}" ${user?.tutorStudentIds?.includes(student.id) ? 'checked' : ''}> ${esc(student.name)} · ${esc(student.course)}</label>`)
        .join('') || '<span class="empty-inline">No hay alumnos activos.</span>';

      $('#usuario-form-message').innerHTML = '';
      toggleUserRoleFields();
      openModal('modal-usuario');
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
  }

  function toggleUserRoleFields() {
    const roleCode = $('#usuario-rol')?.value;
    const help = ROLE_HELP[roleCode] || 'Los permisos se aplican en el servidor.';
    $('#usuario-rol-help').textContent = help;
    $('#usuario-alumno-group').classList.toggle('hidden', roleCode !== 'ALUMNO');
    $('#usuario-tutores-group').classList.toggle('hidden', roleCode !== 'TUTOR');
    $('#usuario-cursos-group').classList.toggle('hidden', roleCode === 'ALUMNO' || roleCode === 'TUTOR' || roleCode === 'ADMINISTRADOR');
    $('#usuario-scope-all').closest('.form-group')?.classList.toggle('hidden', !GLOBAL_SCOPE_ROLES.includes(roleCode));
    if (roleCode === 'ADMINISTRADOR') $('#usuario-scope-all').checked = true;
  }

  async function submitUserForm(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const id = $('#usuario-id').value;
    const isEdit = Boolean(id);
    const roleCode = $('#usuario-rol').value;
    const password = $('#usuario-password').value;
    if (!isEdit && passwordPolicyError(password)) {
      setMessage('usuario-form-message', 'error', passwordPolicyError(password));
      return;
    }

    const payload = {
      email: $('#usuario-email').value.trim(),
      fullName: $('#usuario-nombre').value.trim(),
      roleCode,
      scopeAll: GLOBAL_SCOPE_ROLES.includes(roleCode) ? $('#usuario-scope-all').checked : false,
      courseIds: $$('input[name="user-course"]:checked').map(input => Number(input.value)),
      studentId: roleCode === 'ALUMNO' ? Number($('#usuario-alumno').value) || null : null,
      tutorStudentIds: roleCode === 'TUTOR' ? $$('input[name="user-tutor-student"]:checked').map(input => Number(input.value)) : []
    };
    if (isEdit) payload.isActive = $('#usuario-active').checked;
    else payload.password = password;

    if (roleCode === 'ALUMNO' && !payload.studentId) {
      setMessage('usuario-form-message', 'error', 'Seleccione el legajo del alumno vinculado.');
      return;
    }
    if (roleCode === 'TUTOR' && !payload.tutorStudentIds.length) {
      setMessage('usuario-form-message', 'error', 'Seleccione al menos un alumno a cargo.');
      return;
    }
    if (COURSE_ROLES.includes(roleCode) && !payload.courseIds.length) {
      setMessage('usuario-form-message', 'error', 'Este rol necesita al menos un curso asignado.');
      return;
    }

    const submit = form.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      if (isEdit) await api.users.update(id, payload);
      else await api.users.create(payload);
      toast(isEdit ? 'Cuenta actualizada.' : 'Cuenta creada. La persona deberá cambiar la contraseña al ingresar.', 'success');
      closeModal('modal-usuario');
      await loadAdminUsers();
    } catch (error) {
      setMessage('usuario-form-message', 'error', errorMessage(error));
    } finally {
      if (submit) submit.disabled = false;
    }
  }

  function openResetPassword(user) {
    $('#reset-user-id').value = user.id;
    $('#reset-user-label').textContent = `${user.fullName} · ${user.email}`;
    $('#reset-password').value = '';
    $('#reset-password-confirm').value = '';
    $('#reset-message').innerHTML = '';
    openModal('modal-reset');
  }

  async function submitResetPassword(event) {
    event.preventDefault();
    const id = $('#reset-user-id').value;
    const password = $('#reset-password').value;
    const confirm = $('#reset-password-confirm').value;
    if (password !== confirm) {
      setMessage('reset-message', 'error', 'Las contraseñas no coinciden.');
      return;
    }
    const policy = passwordPolicyError(password);
    if (policy) {
      setMessage('reset-message', 'error', policy);
      return;
    }
    try {
      await api.users.resetPassword(id, password);
      closeModal('modal-reset');
      toast('Contraseña temporal asignada. Se cerraron las sesiones del usuario.', 'success');
      await loadAdminUsers();
    } catch (error) {
      setMessage('reset-message', 'error', errorMessage(error));
    }
  }

  function passwordPolicyError(password) {
    if (typeof password !== 'string' || password.length < 10) return 'La contraseña debe tener al menos 10 caracteres.';
    if (password.length > 200) return 'La contraseña es demasiado larga.';
    if (!/[a-záéíóúüñ]/i.test(password)) return 'La contraseña debe incluir al menos una letra.';
    if (!/\d/.test(password)) return 'La contraseña debe incluir al menos un número.';
    if (!/[^A-Za-z0-9áéíóúüñ]/i.test(password)) return 'La contraseña debe incluir al menos un símbolo.';
    return null;
  }

  // ── Administración: alumnos ─────────────────────────────────────
  async function loadAdminStudents(force = false) {
    if (state.adminStudentsLoaded && !force) return;
    const result = await api.students.list({ include_inactive: 'true' });
    state.adminStudents = result.students || [];
    state.adminStudentsLoaded = true;
    populateCourseFilters();
  }

  function filteredAdminStudents() {
    const query = norm($('#admin-student-search')?.value || '');
    const courseId = $('#admin-student-course')?.value || '';
    const division = $('#admin-student-division')?.value || '';
    const includeInactive = Boolean($('#admin-student-inactive')?.checked);
    return state.adminStudents.filter(student => {
      if (!includeInactive && !student.isActive) return false;
      if (courseId && Number(student.courseId) !== Number(courseId)) return false;
      if (division && Number(student.division) !== Number(division)) return false;
      if (query && !norm(`${student.name} ${student.dni} ${student.legajo || ''} ${student.course}`).includes(query)) return false;
      return true;
    });
  }

  function renderAdminStudents() {
    const tbody = $('#admin-students-tbody');
    if (!tbody) return;
    const students = filteredAdminStudents();
    tbody.innerHTML = students.map(student => {
      const counts = student.counts || {};
      return `
        <tr>
          <td><strong>${esc(student.name)}</strong><br><span class="small muted">${esc(student.email || 'Sin correo')}</span></td>
          <td class="small">${esc(student.dni)}</td>
          <td class="small">${esc(student.legajo || '—')}</td>
          <td class="small">${esc(student.course)}</td>
          <td class="small">${esc(student.guardianEmail || student.email || '—')}</td>
          <td class="small">${counts.total || 0}${counts.pendiente ? ` · ${counts.pendiente} pend.` : ''}</td>
          <td><span class="status-badge ${student.isActive ? 'status-resuelto' : 'status-anulado'}">${student.isActive ? 'Activo' : 'Inactivo'}</span></td>
          <td>
            <div class="student-table-actions">
              <button type="button" class="btn btn-outline btn-xs" data-admin-student-action="edit" data-student-id="${student.id}">Editar</button>
              ${student.isActive
                ? `<button type="button" class="btn btn-warning btn-xs" data-admin-student-action="deactivate" data-student-id="${student.id}">Baja</button>`
                : `<button type="button" class="btn btn-success btn-xs" data-admin-student-action="activate" data-student-id="${student.id}">Reactivar</button>`}
              ${(counts.total || 0) === 0 ? `<button type="button" class="btn btn-danger btn-xs" data-admin-student-action="delete" data-student-id="${student.id}">Eliminar</button>` : ''}
            </div>
          </td>
        </tr>`;
    }).join('');
    $('#admin-students-empty')?.classList.toggle('hidden', students.length > 0);
  }

  async function openStudentModal(student) {
    try {
      await loadCourses();
      const isEdit = Boolean(student);
      $('#modal-alumno-title').textContent = isEdit ? 'Editar alumno' : 'Nuevo alumno';
      $('#alumno-id').value = isEdit ? student.id : '';
      $('#alumno-nombres').value = isEdit ? student.firstName : '';
      $('#alumno-apellidos').value = isEdit ? student.lastName : '';
      $('#alumno-dni').value = isEdit ? student.dni : '';
      $('#alumno-legajo').value = isEdit ? (student.legajo || '') : '';
      $('#alumno-nacimiento').value = isEdit ? dateValue(student.birthDate) : '';
      $('#alumno-email').value = isEdit ? (student.email || '') : '';
      $('#alumno-email-tutor').value = isEdit ? (student.guardianEmail || '') : '';
      $('#alumno-curso').innerHTML = state.courses
        .map(course => `<option value="${course.id}" ${isEdit && Number(student.courseId) === Number(course.id) ? 'selected' : ''}>${esc(course.label)}${course.isActive === false ? ' (inactivo)' : ''}</option>`)
        .join('');
      $('#alumno-form-message').innerHTML = '';
      openModal('modal-alumno');
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
  }

  async function submitStudentForm(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const id = $('#alumno-id').value;
    const isEdit = Boolean(id);
    const dni = $('#alumno-dni').value.replace(/\D/g, '');
    if (!/^\d{6,10}$/.test(dni)) {
      setMessage('alumno-form-message', 'error', 'El DNI debe tener entre 6 y 10 dígitos.');
      return;
    }
    const payload = {
      first_name: $('#alumno-nombres').value.trim(),
      last_name: $('#alumno-apellidos').value.trim(),
      dni,
      legajo: $('#alumno-legajo').value.trim() || null,
      course_id: Number($('#alumno-curso').value),
      email: $('#alumno-email').value.trim() || null,
      guardian_email: $('#alumno-email-tutor').value.trim() || null,
      birth_date: $('#alumno-nacimiento').value || null
    };
    const submit = form.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      if (isEdit) await api.students.update(id, payload);
      else await api.students.create(payload);
      toast(isEdit ? 'Legajo actualizado.' : 'Alumno creado. No se creó una cuenta de acceso automáticamente.', 'success');
      closeModal('modal-alumno');
      await loadAdminStudents(true);
      await reloadSchoolData();
      renderAdminStudents();
    } catch (error) {
      setMessage('alumno-form-message', 'error', errorMessage(error));
    } finally {
      if (submit) submit.disabled = false;
    }
  }

  async function changeStudentStatus(student, activate) {
    if (!activate) {
      if (!window.confirm(`¿Dar de baja lógica a ${student.name}? El legajo y sus informes se conservarán.`)) return;
      try {
        await api.students.remove(student.id, false);
        toast('Alumno dado de baja. El historial se conserva.', 'success');
        await loadAdminStudents(true);
        await reloadSchoolData();
        renderAdminStudents();
      } catch (error) {
        toast(errorMessage(error), 'error');
      }
    } else {
      try {
        await api.students.update(student.id, { is_active: true });
        toast('Alumno reactivado.', 'success');
        await loadAdminStudents(true);
        await reloadSchoolData();
        renderAdminStudents();
      } catch (error) {
        toast(errorMessage(error), 'error');
      }
    }
  }

  async function deleteStudentPermanently(student) {
    const confirmation = window.prompt(
      `Eliminación definitiva de ${student.name}.\nEsta acción no se puede deshacer y sólo se permite si no tiene informes ni cuenta vinculada.\n\nEscriba el DNI ${student.dni} para confirmar:`
    );
    if (confirmation === null) return;
    if (confirmation.trim() !== String(student.dni)) {
      toast('El DNI ingresado no coincide. No se eliminó el legajo.', 'error');
      return;
    }
    try {
      await api.students.remove(student.id, true);
      toast('Legajo eliminado definitivamente.', 'success');
      await loadAdminStudents(true);
      await reloadSchoolData();
      renderAdminStudents();
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
  }

  // ── Administración: cursos ──────────────────────────────────────
  async function loadCourses() {
    const result = await api.courses.list();
    state.courses = result.courses || [];
    populateCourseFilters();
    populateAdminRoleFilter();
  }

  async function loadSettings() {
    const result = await api.settings.get();
    state.settings = result.settings || {};
    $('#setting-school-name').value = state.settings.school_name || state.schoolName || '';
    $('#setting-statement-days').value = Number(state.settings.statement_days) || 5;
    setMessage('settings-message', '', '');
  }

  async function submitSettings(event) {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    try {
      await api.settings.update({
        schoolName: $('#setting-school-name').value.trim(),
        statementDays: Number($('#setting-statement-days').value)
      });
      state.schoolName = $('#setting-school-name').value.trim();
      setMessage('settings-message', 'success', 'Configuración guardada.');
      toast('Configuración actualizada.', 'success');
      await loadSettings();
    } catch (error) {
      setMessage('settings-message', 'error', errorMessage(error));
    } finally {
      if (button) button.disabled = false;
    }
  }

  function renderAdminCourses() {
    const tbody = $('#admin-courses-tbody');
    if (!tbody) return;
    const counts = new Map();
    state.adminStudents.forEach(student => {
      counts.set(Number(student.courseId), (counts.get(Number(student.courseId)) || 0) + 1);
    });
    const courses = [...state.courses].sort((a, b) => (a.year - b.year) || (a.division - b.division) || a.specialty.localeCompare(b.specialty, 'es'));
    tbody.innerHTML = courses.map(course => `
      <tr>
        <td><strong>${esc(course.label)}</strong></td>
        <td>${course.year}°</td>
        <td>${course.division}°</td>
        <td>${esc(course.specialty)}</td>
        <td>${esc(course.shift || '—')}</td>
        <td>${counts.get(Number(course.id)) || 0}</td>
        <td><span class="status-badge ${course.isActive === false ? 'status-anulado' : 'status-resuelto'}">${course.isActive === false ? 'Inactivo' : 'Activo'}</span></td>
        <td>
          <div class="student-table-actions">
            <button type="button" class="btn btn-outline btn-xs" data-course-action="edit" data-course-id="${course.id}">Editar</button>
            <button type="button" class="btn ${course.isActive === false ? 'btn-success' : 'btn-warning'} btn-xs" data-course-action="toggle" data-course-id="${course.id}">${course.isActive === false ? 'Activar' : 'Desactivar'}</button>
          </div>
        </td>
      </tr>`).join('');
  }

  function openCourseModal(course) {
    const isEdit = Boolean(course);
    $('#modal-curso-title').textContent = isEdit ? 'Editar curso' : 'Nuevo curso';
    $('#curso-id').value = isEdit ? course.id : '';
    $('#curso-anio').value = isEdit ? course.year : '';
    $('#curso-division').value = isEdit ? course.division : '';
    $('#curso-especialidad').value = isEdit ? course.specialty : '';
    $('#curso-turno').value = isEdit ? (course.shift || 'Mañana') : 'Mañana';
    $('#curso-form-message').innerHTML = '';
    openModal('modal-curso');
  }

  async function submitCourseForm(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const id = $('#curso-id').value;
    const payload = {
      year: Number($('#curso-anio').value),
      division: Number($('#curso-division').value),
      specialty: $('#curso-especialidad').value.trim(),
      shift: $('#curso-turno').value
    };
    const submit = form.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      if (id) await api.courses.update(id, payload);
      else await api.courses.create(payload);
      toast(id ? 'Curso actualizado.' : 'Curso creado.', 'success');
      closeModal('modal-curso');
      await loadCourses();
      await loadAdminStudents(true);
      renderAdminCourses();
    } catch (error) {
      setMessage('curso-form-message', 'error', errorMessage(error));
    } finally {
      if (submit) submit.disabled = false;
    }
  }

  async function toggleCourse(course) {
    const activate = course.isActive === false;
    if (!activate) {
      const count = state.adminStudents.filter(student => Number(student.courseId) === Number(course.id) && student.isActive).length;
      if (!window.confirm(`¿Desactivar ${course.label}?${count ? ` Tiene ${count} alumno(s) activo(s); no se eliminarán, pero no podrá asignarse a nuevas cuentas.` : ''}`)) return;
    }
    try {
      await api.courses.update(course.id, { is_active: activate });
      toast(activate ? 'Curso activado.' : 'Curso desactivado.', 'success');
      await loadCourses();
      renderAdminCourses();
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
  }

  // ── Administración: auditoría ───────────────────────────────────
  async function loadAudit() {
    const result = await api.audit.list({ limit: 250 });
    state.auditEntries = result.entries || [];
    renderAudit();
  }

  function renderAudit() {
    const tbody = $('#admin-audit-tbody');
    if (!tbody) return;
    tbody.innerHTML = state.auditEntries.map(entry => `
      <tr>
        <td class="small">${fmtDateTime(entry.createdAt)}</td>
        <td class="small"><strong>${esc(entry.actorName)}</strong><br><span class="muted">${esc(entry.actorEmail || '')}</span></td>
        <td class="small">${esc(entry.action)}</td>
        <td class="small">${esc(entry.entity)}${entry.entityId ? ` #${esc(entry.entityId)}` : ''}</td>
        <td><div class="audit-detail">${esc(entry.detail ? JSON.stringify(entry.detail) : '—')}</div></td>
      </tr>`).join('');
    $('#admin-audit-empty')?.classList.toggle('hidden', state.auditEntries.length > 0);
  }

  // ── Importación CSV ─────────────────────────────────────────────
  function openImportModal() {
    state.importCsvText = '';
    state.importResult = null;
    $('#csv-file').value = '';
    $('#import-preview').innerHTML = '';
    $('#import-message').innerHTML = '';
    $('#import-allow-partial').checked = false;
    $('#btn-import-dryrun').disabled = true;
    $('#btn-import-commit').disabled = true;
    openModal('modal-import');
  }

  async function handleCsvFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      state.importCsvText = await file.text();
      state.importResult = null;
      $('#btn-import-dryrun').disabled = !state.importCsvText.trim();
      $('#btn-import-commit').disabled = true;
      $('#import-preview').innerHTML = '';
      setMessage('import-message', '', `Archivo cargado: ${file.name}. Presione “Validar archivo”.`);
    } catch (_) {
      setMessage('import-message', 'error', 'No se pudo leer el archivo.');
    }
  }

  async function validateCsv() {
    if (!state.importCsvText) return;
    const button = $('#btn-import-dryrun');
    if (button) button.disabled = true;
    try {
      const result = await api.students.importCsv(state.importCsvText, true, false);
      state.importResult = result;
      renderImportPreview(result);
      setMessage(
        'import-message',
        result.invalid ? 'warning' : 'success',
        `Validación: ${result.valid} fila(s) válidas y ${result.invalid} con errores, sobre ${result.total} filas.`
      );
      updateImportCommitState();
    } catch (error) {
      setMessage('import-message', 'error', errorMessage(error));
      if (Array.isArray(error.details)) renderImportErrors(error.details);
    } finally {
      if (button) button.disabled = false;
    }
  }

  function renderImportPreview(result) {
    const preview = Array.isArray(result.preview) ? result.preview : [];
    let html = '';
    if (preview.length) {
      html += `<div class="import-preview"><table><thead><tr><th>Fila</th><th>Nombre</th><th>DNI</th><th>Curso</th><th>Legajo</th></tr></thead><tbody>`;
      html += preview.map(row => {
        const course = state.courses.find(item => Number(item.id) === Number(row.course_id));
        return `<tr><td>${row.line}</td><td>${esc(`${row.first_name} ${row.last_name}`)}</td><td>${esc(row.dni)}</td><td>${esc(course ? course.label : `Curso ${row.course_id}`)}</td><td>${esc(row.legajo || '—')}</td></tr>`;
      }).join('');
      html += '</tbody></table></div>';
    }
    if (Array.isArray(result.errors) && result.errors.length) {
      html += `<div class="form-warning" style="margin-top:10px;">Filas con errores</div>
        <ul class="error-list">${result.errors.map(item => `<li>Fila ${item.line}${item.name ? ` (${esc(item.name)})` : ''}: ${esc(item.messages.join(' '))}</li>`).join('')}</ul>`;
    }
    $('#import-preview').innerHTML = html;
  }

  function renderImportErrors(errors) {
    const list = errors.map(item => `<li>Fila ${item.line || '—'}${item.name ? ` (${esc(item.name)})` : ''}: ${esc(Array.isArray(item.messages) ? item.messages.join(' ') : String(item))}</li>`).join('');
    $('#import-preview').innerHTML = `<ul class="error-list">${list}</ul>`;
  }

  function updateImportCommitState() {
    const button = $('#btn-import-commit');
    if (!button) return;
    const result = state.importResult;
    const allowPartial = $('#import-allow-partial').checked;
    button.disabled = !result || !result.valid || (result.invalid > 0 && !allowPartial);
  }

  async function commitCsv() {
    if (!state.importCsvText) return;
    const allowPartial = $('#import-allow-partial').checked;
    if (!window.confirm(`¿Confirma la importación de ${state.importResult?.valid || 0} alumno(s)?`)) return;
    const button = $('#btn-import-commit');
    if (button) button.disabled = true;
    try {
      const result = await api.students.importCsv(state.importCsvText, false, allowPartial);
      toast(`Importación completada: ${result.imported} alumno(s).`, 'success');
      closeModal('modal-import');
      await loadAdminStudents(true);
      await reloadSchoolData();
      renderAdminStudents();
    } catch (error) {
      setMessage('import-message', 'error', errorMessage(error));
      if (Array.isArray(error.details)) renderImportErrors(error.details);
    } finally {
      if (button) button.disabled = false;
    }
  }

  // ── Cuenta y contraseña ─────────────────────────────────────────
  function renderAccount() {
    const container = $('#account-profile');
    if (!container || !state.me) return;
    const me = state.me;
    let scope = '—';
    if (me.roleCode === 'ADMINISTRADOR') scope = 'Acceso administrativo total';
    else if (me.scopeAll) scope = 'Ámbito global';
    else if (me.roleCode === 'ALUMNO') scope = me.studentId ? 'Legajo propio' : 'Sin legajo';
    else if (me.roleCode === 'TUTOR') scope = me.tutorStudentIds?.length ? `${me.tutorStudentIds.length} alumno(s) a cargo` : 'Sin alumnos';
    else if (me.courseIds?.length) scope = me.courseIds.map(id => courseLabel(courseById(id))).join(', ');
    else scope = 'Sin ámbito asignado';

    const fields = [
      ['Nombre completo', me.fullName || '—'],
      ['Mail institucional', me.email || '—'],
      ['Rol', me.roleName || roleName(me.roleCode)],
      ['Ámbito', scope],
      ['Último acceso', me.lastLoginAt ? fmtDateTime(me.lastLoginAt) : '—'],
      ['Cuenta creada', me.createdAt ? fmtDateTime(me.createdAt) : '—']
    ];
    container.innerHTML = fields.map(([label, value]) => `
      <div class="account-field"><div class="field-label">${esc(label)}</div><div class="field-val">${esc(value)}</div></div>`).join('');
  }

  function openPasswordModal(forced) {
    state.forcedPassword = Boolean(forced);
    $('#modal-password').classList.toggle('forced', state.forcedPassword);
    $('#password-forced-note').classList.toggle('hidden', !state.forcedPassword);
    $('#pwd-current').value = '';
    $('#pwd-new').value = '';
    $('#pwd-confirm').value = '';
    $('#password-message').innerHTML = '';
    openModal('modal-password');
  }

  async function submitPasswordChange(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const current = $('#pwd-current').value;
    const password = $('#pwd-new').value;
    const confirm = $('#pwd-confirm').value;
    if (password !== confirm) {
      setMessage('password-message', 'error', 'Las contraseñas nuevas no coinciden.');
      return;
    }
    const policy = passwordPolicyError(password);
    if (policy) {
      setMessage('password-message', 'error', policy);
      return;
    }
    const submit = form.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      await api.changePassword(current, password);
      state.me.mustChangePassword = false;
      state.forcedPassword = false;
      $('#modal-password').classList.remove('forced');
      closeModal('modal-password');
      toast('Contraseña actualizada. Se cerraron las otras sesiones.', 'success');
    } catch (error) {
      setMessage('password-message', 'error', errorMessage(error));
    } finally {
      if (submit) submit.disabled = false;
    }
  }

  // ── Notificaciones ──────────────────────────────────────────────
  function renderNotifications() {
    const list = $('#notificaciones-list');
    if (!list) return;
    const notifications = state.notifications;
    list.innerHTML = notifications.map(item => `
      <div class="notification-item">
        <div class="notif-head">
          <span>${fmtDateTime(item.createdAt)} · ${esc(item.recipientLabel || item.recipientType || 'Destinatario')}</span>
          <span class="stage-badge">${esc(item.type || 'Aviso')}</span>
        </div>
        <strong>${esc(item.studentName ? `Informe de ${item.studentName}` : 'Notificación del sistema')}</strong>
        <p>${esc(item.message)}</p>
        ${item.reportId ? `<div style="margin-top:6px;"><button type="button" class="link-btn" data-report-action="detail" data-report-id="${item.reportId}">Ver informe N° ${item.reportId}</button></div>` : ''}
      </div>`).join('');
    $('#notificaciones-empty')?.classList.toggle('hidden', notifications.length > 0);
    const count = $('#nav-notif-count');
    if (count) {
      count.textContent = notifications.length > 99 ? '99+' : String(notifications.length);
      count.classList.toggle('hidden', notifications.length === 0);
    }
  }

  // ── Eventos ─────────────────────────────────────────────────────
  function bindEvents() {
    $('#loginForm')?.addEventListener('submit', async event => {
      event.preventDefault();
      const email = $('#login-email').value.trim();
      const password = $('#login-password').value;
      const errorBox = $('#login-error');
      errorBox.style.display = 'none';
      errorBox.textContent = '';
      const submit = $('#loginSubmitBtn');
      submit.disabled = true;
      submit.textContent = 'Ingresando…';
      try {
        const session = await api.login(email, password);
        await startSession(session);
      } catch (error) {
        errorBox.textContent = errorMessage(error);
        errorBox.style.display = 'block';
      } finally {
        submit.disabled = false;
        submit.textContent = 'Ingresar';
      }
    });

    $('#btn-forgot-password')?.addEventListener('click', () => {
      window.alert('La recuperación automática de contraseñas no está habilitada. Comuníquese con el administrador del sistema para que asigne una contraseña temporal.');
    });

    $('#btn-logout')?.addEventListener('click', logout);
    $('#btn-logout-account')?.addEventListener('click', logout);
    $('#btn-open-password')?.addEventListener('click', () => openPasswordModal(false));

    $('#btn-mobile-menu')?.addEventListener('click', () => {
      $('#sidebar')?.classList.toggle('open');
      $('#sidebar-overlay')?.classList.toggle('open');
    });
    $('#sidebar-overlay')?.addEventListener('click', closeSidebar);

    $$('.nav-btn[data-section]').forEach(button => {
      button.addEventListener('click', () => showSection(button.dataset.section));
    });

    document.addEventListener('click', event => {
      const closeButton = event.target.closest('[data-close-modal]');
      if (closeButton) {
        closeModal(closeButton.dataset.closeModal);
        return;
      }
      const overlay = event.target;
      if (overlay.classList?.contains('modal-overlay') && overlay.classList.contains('open')) {
        closeModal(overlay.id);
        return;
      }
      const reportButton = event.target.closest('[data-report-action]');
      if (reportButton) {
        event.preventDefault();
        handleReportAction(reportButton.dataset.reportAction, reportButton.dataset.reportId);
        return;
      }
      const studentButton = event.target.closest('[data-student-action]');
      if (studentButton) {
        event.preventDefault();
        const student = state.selectedStudent;
        if (!student) return;
        if (studentButton.dataset.studentAction === 'history') openStudentHistory(student);
        else if (studentButton.dataset.studentAction === 'pdf') {
          openStudentHistory(student).then(downloadStudentHistory);
        } else if (studentButton.dataset.studentAction === 'edit' && state.permissions.manageStudents) {
          openStudentModal(student);
        }
      }
    });

    $('#informes-tabs')?.addEventListener('click', event => {
      const button = event.target.closest('[data-tab]');
      if (!button) return;
      state.reportTab = button.dataset.tab;
      renderReports();
    });
    ['filtro-busqueda', 'filtro-gravedad', 'filtro-curso', 'filtro-etapa'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', renderReports);
      document.getElementById(id)?.addEventListener('change', renderReports);
    });
    $('#btn-nuevo-informe')?.addEventListener('click', () => openReportForm());
    $('#btn-gestion-alumnos')?.addEventListener('click', () => {
      showSection('admin');
      showAdminTab('alumnos');
    });

    $('#informes-list')?.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        const report = event.target.closest('[data-report-id]');
        if (report) showReportDetail(Number(report.dataset.reportId));
      }
    });

    $('#alumnos-grid')?.addEventListener('click', event => {
      const row = event.target.closest('[data-student-id]');
      if (row) showStudentDetail(Number(row.dataset.studentId));
    });
    $('#alumnos-grid')?.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const row = event.target.closest('[data-student-id]');
      if (row) {
        event.preventDefault();
        showStudentDetail(Number(row.dataset.studentId));
      }
    });
    $('#btn-volver-alumnos')?.addEventListener('click', () => {
      state.selectedStudent = null;
      $('#view-alumnos-lista')?.classList.remove('hidden');
      $('#view-alumno-detalle')?.classList.add('hidden');
    });
    ['filtro-alumno-busqueda', 'filtro-alumno-curso', 'filtro-alumno-orden'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', renderStudents);
      document.getElementById(id)?.addEventListener('change', renderStudents);
    });

    $('#admin-tabs')?.addEventListener('click', event => {
      const button = event.target.closest('[data-admin-tab]');
      if (button) showAdminTab(button.dataset.adminTab);
    });

    $('#btn-nuevo-usuario')?.addEventListener('click', () => openUserModal(null));
    $('#btn-nuevo-alumno')?.addEventListener('click', () => openStudentModal(null));
    $('#btn-nuevo-curso')?.addEventListener('click', () => openCourseModal(null));
    $('#btn-importar-alumnos')?.addEventListener('click', openImportModal);
    $('#btn-refresh-audit')?.addEventListener('click', loadAudit);

    ['admin-user-search', 'admin-user-role-filter', 'admin-user-status-filter'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', renderAdminUsers);
      document.getElementById(id)?.addEventListener('change', renderAdminUsers);
    });
    ['admin-student-search', 'admin-student-course', 'admin-student-division', 'admin-student-inactive'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', renderAdminStudents);
      document.getElementById(id)?.addEventListener('change', renderAdminStudents);
    });

    $('#admin-users-tbody')?.addEventListener('click', async event => {
      const button = event.target.closest('[data-user-action]');
      if (!button) return;
      const user = state.users.find(item => item.id === button.dataset.userId);
      if (!user) return;
      const action = button.dataset.userAction;
      if (action === 'edit') await openUserModal(user);
      else if (action === 'reset') openResetPassword(user);
      else if (action === 'deactivate' || action === 'activate') {
        const activate = action === 'activate';
        if (!window.confirm(activate ? `¿Activar la cuenta de ${user.fullName}?` : `¿Desactivar la cuenta de ${user.fullName}? Se cerrarán sus sesiones.`)) return;
        try {
          await api.users.update(user.id, { isActive: activate });
          toast(activate ? 'Cuenta activada.' : 'Cuenta desactivada.', 'success');
          await loadAdminUsers();
        } catch (error) {
          toast(errorMessage(error), 'error');
        }
      }
    });

    $('#admin-students-tbody')?.addEventListener('click', async event => {
      const button = event.target.closest('[data-admin-student-action]');
      if (!button) return;
      const student = state.adminStudents.find(item => Number(item.id) === Number(button.dataset.studentId));
      if (!student) return;
      const action = button.dataset.adminStudentAction;
      if (action === 'edit') await openStudentModal(student);
      else if (action === 'deactivate') await changeStudentStatus(student, false);
      else if (action === 'activate') await changeStudentStatus(student, true);
      else if (action === 'delete') await deleteStudentPermanently(student);
    });

    $('#admin-courses-tbody')?.addEventListener('click', async event => {
      const button = event.target.closest('[data-course-action]');
      if (!button) return;
      const course = state.courses.find(item => Number(item.id) === Number(button.dataset.courseId));
      if (!course) return;
      if (button.dataset.courseAction === 'edit') openCourseModal(course);
      else if (button.dataset.courseAction === 'toggle') await toggleCourse(course);
    });

    $('#usuario-rol')?.addEventListener('change', toggleUserRoleFields);
    $('#studentForm')?.addEventListener('submit', submitStudentForm);
    $('#userForm')?.addEventListener('submit', submitUserForm);
    $('#courseForm')?.addEventListener('submit', submitCourseForm);
    $('#settingsForm')?.addEventListener('submit', submitSettings);
    $('#changePasswordForm')?.addEventListener('submit', submitPasswordChange);
    $('#resetPasswordForm')?.addEventListener('submit', submitResetPassword);
    $('#convivenciaForm')?.addEventListener('submit', submitReportForm);
    $('#btn-form-reset')?.addEventListener('click', () => {
      if (state.editingReport) renderReportForm(state.editingReport);
      else renderReportForm(null);
    });

    $('#csv-file')?.addEventListener('change', handleCsvFile);
    $('#btn-import-dryrun')?.addEventListener('click', validateCsv);
    $('#btn-import-commit')?.addEventListener('click', commitCsv);
    $('#import-allow-partial')?.addEventListener('change', updateImportCommitState);
    $('#btn-history-pdf')?.addEventListener('click', downloadStudentHistory);

    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      const open = $('.modal-overlay.open');
      if (open) closeModal(open.id);
    });

    document.addEventListener('et35:unauthorized', () => {
      if (state.me) {
        state.me = null;
        state.permissions = {};
        api.setCsrf(null);
        showLogin('La sesión expiró o fue cerrada. Vuelva a ingresar.');
      }
    });
  }

  // Arranque: los scripts usan defer, por lo que el DOM ya está disponible.
  boot();
})();
