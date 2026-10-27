import { logger } from '@helpers/logger';

/**
 * @myDocBlock
 * @file appFactory.ts
 * @internal
 * @module App
 * @tag api, factory, bootstrap
 * @version 1.0.1
 * @author william.r.oak@gmail.com
 * @path src/appFactory.ts
 * @summary Builds the Express application instance.
 * @description
 *   Centralized factory to construct the core Express application.
 *   - Configures CORS for subdomain support.
 *   - Orchestrates global middleware registration.
 *   - Loads routes and static assets.
 *   - Handles environment-specific debug logging.
 * @query {}
 * @requestExample none
 * @response none
 * @requires {
 *   "dependencies": ["express", "cors", "cookie-parser"],
 *   "environment": ["CORS_ALLOWED_ORIGINS", "DEBUG"]
 * }
 */
import express, { type Request } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { loadRoutes } from '@loaders/routeLoader';
import adminRoutes from '@src/admin/adminApp';

import { applyGlobalMiddleware } from '@middleware/index';
import { welcomePage } from '@src/admin/client/welcomePage';

import { config, configGet } from '@helpers/config';

const DEBUG = configGet('DEBUG') === 'true';
const AUTH_ME_DEBUG =
  process.env.AUTH_ME_DEBUG === 'true' || process.env.AUTH_ME_DEBUG === '1';

const isLocalhost = (origin: string) =>
  origin === 'http://localhost:19006' || // Expo web default
  origin === 'http://localhost:8081' || // Metro default
  /^http:\/\/localhost:\d+$/.test(origin);

const explicitAllowedOrigins = new Set(
  (config.CORS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);
const configuredApiOrigin = (() => {
  const appKey = (config.APP_KEY ?? '').trim();
  if (!appKey) {
    return null;
  }

  try {
    return new URL(`https://${appKey}`).origin;
  } catch {
    return null;
  }
})();

const publicReadmeDocuments = [
  'William.Oak.Executive.Resume.Sept.2026.pdf',
  'William.Oak.Executive.Cover.Letter.Sept.2026.pdf',
] as const;

function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character];
  });
}

const corsOrigin = (
  req: Request,
  origin: string | undefined,
  callback: (error: Error | null, allow?: boolean) => void,
) => {
  if (!origin || origin === 'null') {
    callback(null, true);
    return;
  }

  if (explicitAllowedOrigins.has(origin)) {
    callback(null, true);
    return;
  }

  if (configuredApiOrigin && origin === configuredApiOrigin) {
    callback(null, true);
    return;
  }

  let isCurrentHost = false;
  try {
    const requestOrigin = new URL(`${req.protocol}://${req.get('host')}`).origin;
    isCurrentHost = new URL(origin).origin === requestOrigin;
  } catch {
    isCurrentHost = false;
  }

  if (isCurrentHost || (DEBUG && isLocalhost(origin))) {
    callback(null, true);
    return;
  }

  callback(new Error(`CORS blocked for origin: ${origin}`), false);
};

/**
 * Builds the core Express app with middleware and routes.
 * Shared by server.ts (production) and tests.
 */
export async function createBaseApp() {
  const app = express();
  app.set('trust proxy', true);

  // CORS must come first
  app.use((req, res, next) =>
    cors({
      origin: (origin, callback) => corsOrigin(req, origin, callback),
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Tenant',
        'X-Device-Id',
        'X-Lang',
        'x-lang',
        'X-Language',
        'x-language',
        'X-Locale',
        'x-locale',
        'X-Language-Hint',
        'x-language-hint',
        'Language-Hint',
        'language-hint',
        'X-Lang-Hint',
        'x-lang-hint',
        'Lang-Hint',
        'lang-hint',
        'Language',
        'language',
        'Lang',
        'lang',
        'Locale',
        'locale',
        'Accept-Language',
        'accept-language',
        'Content-Language',
        'content-language',
        'X-Log-Visit',
        'x-log-visit',
        'X-Skip-Logging',
        'x-skip-logging',
        'X-No-Log',
        'x-no-log',
        'X-Audit-Log',
        'x-audit-log',
        'X-Log',
        'x-log',
      ],
      credentials: true,
    })(req, res, next),
  );

  // Body parsing
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  for (const documentName of publicReadmeDocuments) {
    app.get(`/readme/${documentName}`, (_req, res) => {
      res.sendFile(path.resolve(process.cwd(), 'readme', documentName));
    });
  }

  app.get('/favicon.ico', (_req, res) => res.status(204).end());
  app.use(express.static('public'));

  // Resolve administration assets according to the runtime environment.
  //
  // Development:
  //   /data/websites/iworkhere/api-dev.iworkhere.com/src/admin/client/assets
  //
  // Production:
  //   /data/websites/iworkhere/api-production-test/admin/assets

  const configuredAdminAssetsPath = process.env.ADMIN_ASSETS_DIR
    ? path.resolve(process.env.ADMIN_ASSETS_DIR)
    : undefined;
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const adminAssetCandidates = [
    configuredAdminAssetsPath,
    process.env.NODE_ENV === 'production'
      ? path.resolve(process.cwd(), 'admin/assets')
      : undefined,
    path.resolve(process.cwd(), 'src/admin/client/assets'),
    path.resolve(moduleDirectory, 'admin/client/assets'),
    path.resolve(moduleDirectory, '../src/admin/client/assets'),
  ].filter((candidate): candidate is string => Boolean(candidate));
  const adminAssetsPath =
    adminAssetCandidates.find((candidate) => fs.existsSync(candidate)) ??
    adminAssetCandidates[0];

  app.use('/admin/assets', express.static(adminAssetsPath));
  app.use('/coverage', express.static(path.resolve('coverage')));
  applyGlobalMiddleware(app);

  if (DEBUG) {
    logger.log(`[DEBUG] AUTH_ME_DEBUG is: ${AUTH_ME_DEBUG}`);
  }
  if (AUTH_ME_DEBUG) {
    // Diagnostic logging for JSON requests (debug only).
    app.use((req, _res, next) => {
      if (req.headers['content-type']?.includes('application/json')) {
        const forwardedFor = req.headers['x-forwarded-for'];
        const realIp = req.headers['x-real-ip'];
        const requestId = req.headers['x-request-id'];
        const cfRay = req.headers['cf-ray'];
        let bodyText = '<no body>';
        if (req.body !== undefined) {
          try {
            bodyText = JSON.stringify(req.body, null, 2);
          } catch {
            bodyText = '<unserializable body>';
          }
        }

        logger.log('----------------------------------------');
        logger.log('--- JSON REQUEST ---');
        logger.log(`${req.method} ${req.originalUrl}`);
        logger.log(`host=${req.hostname}`);
        logger.log(`ip=${req.ip}`);
        if (forwardedFor) {
          logger.log(`x-forwarded-for=${forwardedFor}`);
        }
        if (realIp) {
          logger.log(`x-real-ip=${realIp}`);
        }
        if (requestId) {
          logger.log(`x-request-id=${requestId}`);
        }
        if (cfRay) {
          logger.log(`cf-ray=${cfRay}`);
        }
        logger.log(`user-agent=${req.get('user-agent') ?? ''}`);
        logger.log(`origin=${req.get('origin') ?? ''}`);
        logger.log(`referer=${req.get('referer') ?? ''}`);
        logger.log(`body=${bodyText}`);
        logger.log('----------------------------------------');
      }
      next();
    });
  }

  // Routes
  app.get('/', (req, res) => {
    logger.log('Root route / hit!');
    res.set('Cache-Control', 'no-store');
    res.send(welcomePage(!!req.auth));
  });

  // Handle verification redirects
  app.get('/verification-success', (_req, res) => {
    res.send(`
            <!DOCTYPE html>
            <html>
            <head><title>Success</title></head>
            <body><h1>Verification Successful!</h1><p>You can now log in.</p><a href="/">Go to Login</a></body>
            </html>
        `);
  });

  app.get('/verification-error', (req, res) => {
    const error = escapeHtml(req.query.error || 'Unknown error');
    res.send(`
            <!DOCTYPE html>
            <html>
            <head><title>Error</title></head>
            <body><h1>Verification Failed</h1><p>Error: ${error}</p><a href="/">Go to Login</a></body>
            </html>
        `);
  });
  await loadRoutes(app);
  app.use('/admin', adminRoutes);

  if (DEBUG) {
    logger.dir(app.locals.routeTree?.['/v1/health'], { depth: 10 });
  }

  return app;
}

export async function createTestApp() {
  return createBaseApp();
}
