import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}. Copie .env.example a .env y complete los valores.`);
  return value;
}

const isProduction = process.env.NODE_ENV === 'production';
const defaultOrigin = `http://localhost:${Number(process.env.PORT || 3000)}`;

function normalizeOrigin(value) {
  const text = String(value || '').trim().replace(/\/+$/, '');
  if (!text) return '';
  try {
    const url = new URL(text);
    return `${url.protocol}//${url.host}`;
  } catch {
    return text;
  }
}

const configuredOrigins = [...new Set(
  String(process.env.APP_ORIGIN || defaultOrigin)
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean)
)];

// localhost y 127.0.0.1/[::1] son la misma aplicación en desarrollo.
// Agregarlos evita el error "Origen de la petición no permitido" según
// el host que elija el navegador o el túnel local.
const loopbackOrigins = [];
for (const origin of configuredOrigins) {
  try {
    const url = new URL(origin);
    if (url.protocol !== 'http:' || url.hostname !== 'localhost') continue;
    for (const host of ['127.0.0.1', '[::1]']) {
      loopbackOrigins.push(`${url.protocol}//${host}${url.port ? `:${url.port}` : ''}`);
    }
  } catch {
    // Origen no parseable: se conserva tal cual en configuredOrigins.
  }
}

const appOrigins = [...new Set([...configuredOrigins, ...loopbackOrigins])];

function isAllowedOrigin(value) {
  const origin = normalizeOrigin(value);
  if (!origin) return true;
  if (appOrigins.includes(origin)) return true;
  try {
    const url = new URL(origin);
    // TryCloudflare asigna un subdominio nuevo en cada reinicio del túnel.
    return url.protocol === 'https:' && url.hostname.endsWith('.trycloudflare.com');
  } catch {
    return false;
  }
}

const config = {
  env: process.env.NODE_ENV || 'development',
  isProduction,
  port: Number(process.env.PORT || 3000),
  databaseUrl: required('DATABASE_URL'),
  databaseSsl: String(process.env.DATABASE_SSL || '').toLowerCase() === 'true',
  databaseSslRejectUnauthorized: String(process.env.DATABASE_SSL_REJECT_UNAUTHORIZED || 'true').toLowerCase() !== 'false',
  appOrigin: appOrigins[0] || defaultOrigin,
  appOrigins,
  isAllowedOrigin,
  sessionHours: Math.max(1, Math.min(72, Number(process.env.SESSION_HOURS || 8))),
  statementDays: Math.max(1, Math.min(30, Number(process.env.STATEMENT_DAYS || 5))),
  allowInitialPassword: String(process.env.ALLOW_INITIAL_PASSWORD ?? process.env.DEMO_MODE ?? '').toLowerCase() === 'true',
  trustProxy: Math.max(0, Number(process.env.TRUST_PROXY || 0)),
  mail: {
    enabled: String(process.env.MAIL_ENABLED || '').toLowerCase() === 'true',
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    from: process.env.MAIL_FROM || process.env.SMTP_USER || 'no-reply@latzina.edu.ar',
    subjectPrefix: process.env.MAIL_SUBJECT_PREFIX || '[Escuela Técnica N° 35] '
  }
};

if (config.isProduction && !config.appOrigins.every(origin => origin.startsWith('https://'))) {
  console.warn('[config] APP_ORIGIN no usa HTTPS. En producción configure HTTPS mediante un proxy inverso.');
}

export default config;
