#!/usr/bin/env node
// Aplica en orden los archivos db/migrations/*.sql y registra cuáles ya
// fueron ejecutados. Es idempotente: puede correrse varias veces.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, closePool } from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '..', '..', 'db', 'migrations');

async function main() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename    TEXT PRIMARY KEY,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const applied = new Set(
      (await client.query('SELECT filename FROM schema_migrations')).rows.map(row => row.filename)
    );

    const files = (await fs.readdir(MIGRATIONS_DIR))
      .filter(name => name.endsWith('.sql'))
      .sort();

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`✓ ${file} (ya aplicada)`);
        continue;
      }
      const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      console.log(`→ Aplicando ${file}...`);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        count += 1;
        console.log(`✓ ${file}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Falló ${file}: ${error.message}`);
      }
    }
    console.log(count ? `\n${count} migración(es) aplicada(s).` : '\nLa base ya estaba actualizada.');
  } finally {
    client.release();
    await closePool();
  }
}

main().catch(error => {
  console.error('\n[db:migrate]', error.message);
  process.exitCode = 1;
});
