import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

const PARAMS = { N: 2 ** 15, r: 8, p: 1, keylen: 64, maxmem: 128 * 1024 * 1024 };

/**
 * Hash de contraseña con scrypt (función de derivación de claves de la
 * biblioteca estándar de Node). Formato: scrypt$N$r$p$saltBase64$hashBase64
 * El hash y el salt se guardan en la base; nunca la contraseña.
 */
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, PARAMS.keylen, {
    N: PARAMS.N, r: PARAMS.r, p: PARAMS.p, maxmem: PARAMS.maxmem
  });
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  try {
    const parts = String(stored || '').split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const N = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    if (![N, r, p].every(Number.isInteger)) return false;
    const salt = Buffer.from(parts[4], 'base64');
    const expected = Buffer.from(parts[5], 'base64');
    const derived = await scrypt(password, salt, expected.length, {
      N, r, p, maxmem: PARAMS.maxmem
    });
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch (_) {
    return false;
  }
}

export function generateToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function passwordPolicyError(password) {
  if (typeof password !== 'string' || password.length < 10) {
    return 'La contraseña debe tener al menos 10 caracteres.';
  }
  if (password.length > 200) return 'La contraseña es demasiado larga.';
  if (!/[a-záéíóúüñ]/i.test(password)) return 'La contraseña debe incluir al menos una letra.';
  if (!/\d/.test(password)) return 'La contraseña debe incluir al menos un número.';
  if (!/[^A-Za-z0-9áéíóúüñ]/i.test(password)) return 'La contraseña debe incluir al menos un símbolo.';
  return null;
}
