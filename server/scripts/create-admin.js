#!/usr/bin/env node
// Crea (o restablece) una cuenta de administrador en producción.
// Uso interactivo:
//   npm run user:create
// Uso no interactivo:
//   node server/scripts/create-admin.js --email=admin@colegio.edu.ar --name="Nombre Apellido" --password="..."
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { pool, closePool } from '../db.js';
import { hashPassword, passwordPolicyError } from '../lib/password.js';

function arg(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find(item => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

async function main() {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    let email = arg('email');
    let name = arg('name');
    let password = arg('password');

    if (!email) email = (await rl.question('Mail del administrador: ')).trim().toLowerCase();
    if (!name) name = (await rl.question('Nombre completo: ')).trim();
    if (!password) password = (await rl.question('Contraseña (mín. 10, letra + número + símbolo): ')).trim();

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Mail inválido.');
    if (name.length < 3) throw new Error('Nombre demasiado corto.');
    const policy = passwordPolicyError(password);
    if (policy) throw new Error(policy);

    const client = await pool.connect();
    try {
      const role = await client.query(`SELECT id FROM roles WHERE code = 'ADMINISTRADOR'`);
      if (!role.rows[0]) throw new Error('Falta el rol ADMINISTRADOR. Ejecute primero npm run db:migrate.');
      const hash = await hashPassword(password);
      const existing = await client.query('SELECT id FROM users WHERE lower(email) = lower($1)', [email]);

      if (existing.rows[0]) {
        await client.query(
          `UPDATE users SET password_hash = $1, full_name = $2, role_id = $3, is_active = TRUE,
             scope_all = TRUE, must_change_password = FALSE, failed_login_attempts = 0, locked_until = NULL,
             updated_at = now()
           WHERE id = $4`,
          [hash, name, role.rows[0].id, existing.rows[0].id]
        );
        await client.query('DELETE FROM sessions WHERE user_id = $1', [existing.rows[0].id]);
        console.log(`✓ Contraseña y rol de administrador actualizados para ${email}.`);
      } else {
        await client.query(
          `INSERT INTO users (email, password_hash, full_name, role_id, scope_all, is_active, must_change_password)
           VALUES ($1, $2, $3, $4, TRUE, TRUE, FALSE)`,
          [email, hash, name, role.rows[0].id]
        );
        console.log(`✓ Administrador creado: ${email}`);
      }
    } finally {
      client.release();
    }
  } finally {
    rl.close();
    await closePool();
  }
}

main().catch(error => {
  console.error('\n[user:create]', error.message);
  process.exitCode = 1;
});
