import pg from 'pg';
import config from './config.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ssl: config.databaseSsl
    ? { rejectUnauthorized: config.databaseSslRejectUnauthorized }
    : false
});

pool.on('error', (error) => {
  console.error('[db] Error inesperado en el pool de PostgreSQL:', error.message);
});

export function query(text, params) {
  return pool.query(text, params);
}

export async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool() {
  await pool.end();
}
