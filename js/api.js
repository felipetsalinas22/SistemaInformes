/* ══════════════════════════════════════════════════════════════════
   ET35 · Cliente HTTP
   - Cookies httpOnly: la sesión nunca se guarda en localStorage.
   - CSRF: token en memoria, enviado en X-CSRF-Token.
   - Los permisos reales viven en el servidor; este cliente sólo oculta
     acciones para mejorar la experiencia.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  let csrfToken = null;

  class ApiError extends Error {
    constructor(message, status, code, details) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.code = code;
      this.details = details;
    }
  }

  function setCsrf(token) {
    csrfToken = token || null;
  }

  function buildQuery(params) {
    if (!params) return '';
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      search.set(key, String(value));
    });
    const query = search.toString();
    return query ? `?${query}` : '';
  }

  async function request(method, path, body, options = {}) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined && !(body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }
    if (method !== 'GET' && method !== 'HEAD' && csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }

    let response;
    try {
      response = await fetch(`/api${path}`, {
        method,
        headers,
        credentials: 'same-origin',
        cache: 'no-store',
        body: body instanceof FormData ? body : (body === undefined ? undefined : JSON.stringify(body))
      });
    } catch (_) {
      throw new ApiError('No se pudo conectar con el servidor. Verifique su conexión a la red institucional.', 0, 'NETWORK_ERROR');
    }

    const contentType = response.headers.get('content-type') || '';
    let payload = null;
    if (contentType.includes('application/json')) {
      try { payload = await response.json(); } catch (_) { payload = null; }
    }

    if (!response.ok) {
      if (response.status === 401 && options.silent401 !== true) {
        document.dispatchEvent(new CustomEvent('et35:unauthorized'));
      }
      throw new ApiError(
        (payload && payload.error) || `Error del servidor (${response.status}).`,
        response.status,
        (payload && payload.code) || 'ERROR',
        payload && payload.details
      );
    }
    return payload;
  }

  const get = (path, params, options) => request('GET', path + buildQuery(params), undefined, options);
  const post = (path, body, options) => request('POST', path, body, options);
  const patch = (path, body, options) => request('PATCH', path, body, options);
  const del = (path, options) => request('DELETE', path, undefined, options);

  const api = {
    ApiError,
    setCsrf,
    getCsrf: () => csrfToken,

    config: () => get('/auth/config', null, { silent401: true }),
    login: (email, password) => post('/auth/login', { email, password }, { silent401: true }),
    me: () => get('/auth/me', null, { silent401: true }),
    logout: () => post('/auth/logout', {}),
    changePassword: (currentPassword, newPassword) => post('/auth/change-password', { currentPassword, newPassword }),
    meta: () => get('/meta'),

    reports: {
      list: (params) => get('/reports', params),
      get: (id) => get(`/reports/${encodeURIComponent(id)}`),
      create: (data) => post('/reports', data),
      update: (id, data) => patch(`/reports/${encodeURIComponent(id)}`, data),
      annul: (id, motivo) => post(`/reports/${encodeURIComponent(id)}/annul`, { motivo }),
      revert: (id) => post(`/reports/${encodeURIComponent(id)}/revert`, {})
    },

    students: {
      list: (params) => get('/students', params),
      get: (id) => get(`/students/${encodeURIComponent(id)}`),
      create: (data) => post('/students', data),
      update: (id, data) => patch(`/students/${encodeURIComponent(id)}`, data),
      remove: (id, permanent) => del(`/students/${encodeURIComponent(id)}${permanent ? '?permanent=true' : ''}`),
      importCsv: (csv, dryRun, allowPartial) => post('/students/import', {
        csv,
        dryRun: Boolean(dryRun),
        allowPartial: Boolean(allowPartial)
      })
    },

    users: {
      list: () => get('/users'),
      create: (data) => post('/users', data),
      update: (id, data) => patch(`/users/${encodeURIComponent(id)}`, data),
      resetPassword: (id, newPassword) => post(`/users/${encodeURIComponent(id)}/reset-password`, { newPassword })
    },

    courses: {
      list: () => get('/courses'),
      create: (data) => post('/courses', data),
      update: (id, data) => patch(`/courses/${encodeURIComponent(id)}`, data)
    },

    notifications: {
      list: (params) => get('/notifications', params)
    },

    settings: {
      get: () => get('/settings'),
      update: (data) => patch('/settings', data)
    },

    audit: {
      list: (params) => get('/audit', params)
    }
  };

  window.ET35 = window.ET35 || {};
  window.ET35.api = api;
})();
