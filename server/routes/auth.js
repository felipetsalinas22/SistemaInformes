import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import config from '../config.js';
import {
  findUserByEmail, createSession, setSessionCookie, clearSessionCookie,
  destroySession, destroyAllUserSessions, publicUser, requireCsrf, SESSION_COOKIE
} from '../auth.js';
import { hashPassword, verifyPassword, passwordPolicyError, generateToken } from '../lib/password.js';
import { ApiError, asyncHandler } from '../lib/http.js';
import { parseBody, emailSchema, passwordSchema } from '../lib/validate.js';
import { writeAudit } from '../lib/audit.js';
import { buildPermissions } from '../permissions.js';

const router = Router();

// Hash ficticio para igualar tiempos de respuesta cuando el mail no existe.
const DUMMY_HASH = await hashPassword(generateToken(18));

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200)
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema
});

router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = parseBody(loginSchema, req.body);
  const user = await findUserByEmail(email);

  if (!user) {
    await verifyPassword(password, DUMMY_HASH);
    await writeAudit({ action: 'LOGIN_FALLIDO', entity: 'auth', detail: { email, reason: 'credenciales' }, ip: req.ip });
    throw ApiError.unauthorized('Mail o contraseña incorrectos.');
  }

  if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
    await writeAudit({ action: 'LOGIN_BLOQUEADO', entity: 'auth', entityId: user.id, detail: { email }, ip: req.ip });
    throw new ApiError(429, 'La cuenta está temporalmente bloqueada por intentos fallidos. Intente más tarde.', 'ACCOUNT_LOCKED');
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid || !user.is_active) {
    const attempts = Number(user.failed_login_attempts || 0) + 1;
    const lockedUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
    await query(
      'UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3',
      [attempts, lockedUntil, user.id]
    );
    await writeAudit({
      action: 'LOGIN_FALLIDO',
      entity: 'auth',
      entityId: user.id,
      detail: { email, reason: !user.is_active ? 'cuenta_inactiva' : 'credenciales', attempts },
      ip: req.ip
    });
    throw ApiError.unauthorized('Mail o contraseña incorrectos.');
  }

  await query(
    'UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = now() WHERE id = $1',
    [user.id]
  );

  const session = await createSession(user.id, req);
  setSessionCookie(res, session.token, session.expiresAt);
  await writeAudit({ actor: user, action: 'LOGIN', entity: 'auth', entityId: user.id, ip: req.ip });

  const fresh = { ...user, failed_login_attempts: 0, locked_until: null, last_login_at: new Date() };
  res.json({
    user: publicUser(fresh),
    permissions: buildPermissions(fresh),
    csrfToken: session.csrfToken
  });
}));

router.post('/logout', requireCsrf, asyncHandler(async (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (req.user) {
    await writeAudit({ actor: req.user, action: 'LOGOUT', entity: 'auth', entityId: req.user.id, ip: req.ip });
  }
  await destroySession(token);
  clearSessionCookie(res);
  res.json({ ok: true });
}));

router.get('/me', asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  res.json({
    user: publicUser(req.user),
    permissions: buildPermissions(req.user),
    csrfToken: req.csrfToken
  });
}));

router.post('/change-password', requireCsrf, asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  const { currentPassword, newPassword } = parseBody(changePasswordSchema, req.body);

  const valid = await verifyPassword(currentPassword, req.user.password_hash);
  if (!valid) throw ApiError.badRequest('La contraseña actual no es correcta.');
  if (currentPassword === newPassword) throw ApiError.badRequest('La nueva contraseña debe ser distinta de la actual.');

  const policyError = passwordPolicyError(newPassword);
  if (policyError) throw ApiError.badRequest(policyError);

  const hash = await hashPassword(newPassword);
  await query('UPDATE users SET password_hash = $1, must_change_password = FALSE WHERE id = $2', [hash, req.user.id]);
  const currentToken = req.cookies?.[SESSION_COOKIE];
  await destroyAllUserSessions(req.user.id, currentToken);

  await writeAudit({ actor: req.user, action: 'CAMBIO_CONTRASEÑA', entity: 'user', entityId: req.user.id, ip: req.ip });
  res.json({ ok: true, message: 'Contraseña actualizada.' });
}));

// El registro público está deshabilitado: las cuentas las crea un administrador.
router.post('/register', asyncHandler(async (_req, _res) => {
  throw ApiError.forbidden('El registro público está deshabilitado. Un administrador del sistema debe crear su cuenta.');
}));

router.get('/config', (_req, res) => {
  res.json({
    demoMode: config.demoMode,
    schoolName: 'Escuela Técnica N° 35 D.E. 18 "Ing. Eduardo Latzina"',
    sessionHours: config.sessionHours
  });
});

export default router;
