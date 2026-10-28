import { query } from './db.js';
import config from './config.js';
import { generateToken, sha256 } from './lib/password.js';
import { ApiError } from './lib/http.js';

export const SESSION_COOKIE = 'et35_sid';

const USER_SELECT = `
  SELECT u.id, u.email, u.full_name, u.password_hash, u.role_id, u.student_id,
         u.scope_all, u.is_active, u.must_change_password, u.failed_login_attempts,
         u.locked_until, u.last_login_at, u.created_at, u.updated_at,
         r.code AS role_code, r.name AS role_name,
         COALESCE((
           SELECT array_agg(uc.course_id ORDER BY uc.course_id)
           FROM user_courses uc WHERE uc.user_id = u.id
         ), '{}') AS course_ids,
         COALESCE((
           SELECT array_agg(ts.student_id ORDER BY ts.student_id)
           FROM tutor_students ts WHERE ts.tutor_user_id = u.id
         ), '{}') AS tutor_student_ids
  FROM users u
  JOIN roles r ON r.id = u.role_id
`;

export async function findUserByEmail(email) {
  const result = await query(`${USER_SELECT} WHERE lower(u.email) = lower($1) LIMIT 1`, [email]);
  return result.rows[0] || null;
}

export async function findUserById(id) {
  const result = await query(`${USER_SELECT} WHERE u.id = $1 LIMIT 1`, [id]);
  return result.rows[0] || null;
}

export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    roleCode: user.role_code,
    roleName: user.role_name,
    studentId: user.student_id,
    scopeAll: Boolean(user.scope_all),
    courseIds: user.course_ids || [],
    tutorStudentIds: user.tutor_student_ids || [],
    isActive: Boolean(user.is_active),
    mustChangePassword: Boolean(user.must_change_password),
    lastLoginAt: user.last_login_at,
    createdAt: user.created_at
  };
}

export async function createSession(userId, req) {
  const token = generateToken(32);
  const csrfToken = generateToken(24);
  const expiresAt = new Date(Date.now() + config.sessionHours * 60 * 60 * 1000);
  await query(
    `INSERT INTO sessions (token_hash, user_id, csrf_token, expires_at, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      sha256(token),
      userId,
      csrfToken,
      expiresAt,
      req.ip || null,
      String(req.get('user-agent') || '').slice(0, 500)
    ]
  );
  return { token, csrfToken, expiresAt };
}

export function setSessionCookie(res, token, expiresAt) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    path: '/'
  });
}

export async function destroySession(token) {
  if (!token) return;
  await query('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)]);
}

export async function destroyAllUserSessions(userId, exceptToken = null) {
  if (exceptToken) {
    await query('DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2', [userId, sha256(exceptToken)]);
  } else {
    await query('DELETE FROM sessions WHERE user_id = $1', [userId]);
  }
}

export async function sessionMiddleware(req, _res, next) {
  try {
    req.user = null;
    req.sessionRecord = null;
    req.csrfToken = null;
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) return next();

    const result = await query(
      `SELECT s.token_hash, s.user_id, s.csrf_token, s.expires_at,
              u.is_active, u.role_id
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1
       LIMIT 1`,
      [sha256(token)]
    );
    const session = result.rows[0];
    if (!session) return next();
    if (new Date(session.expires_at).getTime() < Date.now() || !session.is_active) {
      await query('DELETE FROM sessions WHERE token_hash = $1', [session.token_hash]);
      return next();
    }

    const user = await findUserById(session.user_id);
    if (!user || !user.is_active) return next();

    req.sessionRecord = session;
    req.csrfToken = session.csrf_token;
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireAuth(req, _res, next) {
  if (!req.user) return next(ApiError.unauthorized());
  next();
}

export function checkOrigin(req, _res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (origin && !config.appOrigins.includes(origin)) {
    return next(ApiError.forbidden('Origen de la petición no permitido.'));
  }
  next();
}

export function requireCsrf(req, _res, next) {
  if (!req.user) return next(ApiError.unauthorized());
  const header = req.get('x-csrf-token');
  if (!header || !req.csrfToken || header !== req.csrfToken) {
    return next(ApiError.forbidden('Token de seguridad inválido o vencido. Recargue la página.'));
  }
  next();
}

export async function cleanupExpiredSessions() {
  await query('DELETE FROM sessions WHERE expires_at < now()');
}
