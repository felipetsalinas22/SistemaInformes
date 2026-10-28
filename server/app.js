import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';

import config from './config.js';
import { query } from './db.js';
import { sessionMiddleware, checkOrigin } from './auth.js';
import { ApiError } from './lib/http.js';
import authRoutes from './routes/auth.js';
import metaRoutes from './routes/meta.js';
import reportRoutes from './routes/reports.js';
import studentRoutes from './routes/students.js';
import userRoutes from './routes/users.js';
import courseRoutes from './routes/courses.js';
import notificationRoutes from './routes/notifications.js';
import settingsRoutes from './routes/settings.js';
import auditRoutes from './routes/audit.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy > 0) app.set('trust proxy', config.trustProxy);

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        ...(config.isProduction ? {} : { upgradeInsecureRequests: null })
      }
    },
    crossOriginEmbedderPolicy: false,
    hsts: config.isProduction ? { maxAge: 15552000, includeSubDomains: true } : false,
    referrerPolicy: { policy: 'same-origin' }
  }));

  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  app.use(sessionMiddleware);

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 600,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Demasiadas solicitudes. Intente nuevamente más tarde.', code: 'RATE_LIMITED' }
  });
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 12,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { error: 'Demasiados intentos de inicio de sesión. Intente nuevamente en 15 minutos.', code: 'RATE_LIMITED' }
  });

  app.use('/api', apiLimiter);
  app.use('/api', checkOrigin);

  app.get('/api/health', async (_req, res) => {
    try {
      await query('SELECT 1');
      res.json({ ok: true, db: 'up' });
    } catch (_) {
      res.status(503).json({ ok: false, db: 'down' });
    }
  });

  app.use('/api/auth/login', loginLimiter);
  app.use('/api/auth', authRoutes);
  app.use('/api/meta', metaRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/students', studentRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/courses', courseRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/audit', auditRoutes);

  app.use('/js', express.static(path.join(ROOT, 'js'), {
    index: false,
    dotfiles: 'deny',
    maxAge: config.isProduction ? '1h' : 0
  }));

  app.get('/vendor/jspdf.umd.min.js', (_req, res) => {
    res.sendFile(path.join(ROOT, 'node_modules', 'jspdf', 'dist', 'jspdf.umd.min.js'));
  });

  app.get(['/', '/index.html'], (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.sendFile(path.join(ROOT, 'index.html'));
  });
  app.get('/escudo.png', (_req, res) => res.sendFile(path.join(ROOT, 'escudo.png')));
  app.get('/favicon.ico', (_req, res) => res.status(204).end());

  app.use('/api', (_req, _res, next) => next(ApiError.notFound('Endpoint no encontrado.')));

  app.use((req, res) => {
    res.status(404).type('text/plain').send('No encontrado');
  });

  // Manejador central de errores: nunca expone trazas ni datos internos al cliente.
  app.use((error, req, res, _next) => {
    const status = error instanceof ApiError ? error.status : (Number(error.status) || 500);
    if (status >= 500) {
      console.error(`[api] ${req.method} ${req.originalUrl}`, error);
    }
    const body = {
      error: status >= 500 ? 'Error interno del servidor.' : error.message,
      code: error.code || 'ERROR'
    };
    if (error.details) body.details = error.details;
    res.status(status).json(body);
  });

  return app;
}
