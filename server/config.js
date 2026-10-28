import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}. Copie .env.example a .env y complete los valores.`);
  return value;
}

const isProduction = process.env.NODE_ENV === 'production';
const defaultOrigin = `http://localhost:${Number(process.env.PORT || 3000)}`;
const appOrigins = String(process.env.APP_ORIGIN || defaultOrigin)
  .split(',')
  .map(value => value.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const config = {
  env: process.env.NODE_ENV || 'development',
  isProduction,
  port: Number(process.env.PORT || 3000),
  databaseUrl: required('DATABASE_URL'),
  databaseSsl: String(process.env.DATABASE_SSL || '').toLowerCase() === 'true',
  databaseSslRejectUnauthorized: String(process.env.DATABASE_SSL_REJECT_UNAUTHORIZED || 'true').toLowerCase() !== 'false',
  appOrigin: appOrigins[0] || defaultOrigin,
  appOrigins,
  sessionHours: Math.max(1, Math.min(72, Number(process.env.SESSION_HOURS || 8))),
  statementDays: Math.max(1, Math.min(30, Number(process.env.STATEMENT_DAYS || 5))),
  demoMode: String(process.env.DEMO_MODE || '').toLowerCase() === 'true',
  trustProxy: Math.max(0, Number(process.env.TRUST_PROXY || 0))
};

if (config.isProduction && !config.appOrigins.every(origin => origin.startsWith('https://'))) {
  console.warn('[config] APP_ORIGIN no usa HTTPS. En producción configure HTTPS mediante un proxy inverso.');
}

export default config;
