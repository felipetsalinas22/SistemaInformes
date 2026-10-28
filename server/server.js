import config from './config.js';
import { createApp } from './app.js';
import { closePool } from './db.js';
import { cleanupExpiredSessions } from './auth.js';

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`Sistema de Informes de Convivencia escuchando en ${config.appOrigins.join(', ')}`);
  console.log(`Entorno: ${config.env}${config.demoMode ? ' (modo demostración)' : ''}`);
});

cleanupExpiredSessions().catch(error => console.error('[auth] No se pudieron limpiar sesiones vencidas:', error.message));
const cleanupTimer = setInterval(() => {
  cleanupExpiredSessions().catch(error => console.error('[auth] Limpieza de sesiones:', error.message));
}, 60 * 60 * 1000);
cleanupTimer.unref();

async function shutdown(signal) {
  console.log(`\n${signal} recibido. Cerrando servidor...`);
  server.close(async () => {
    await closePool().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (error) => console.error('[unhandledRejection]', error));
process.on('uncaughtException', (error) => {
  console.error('[uncaughtException]', error);
  shutdown('uncaughtException');
});
