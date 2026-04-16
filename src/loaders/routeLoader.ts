/**
 * @myDocBlock v2.3
 * @file routeLoader.ts
 * @internal
 * @module loaders/routeLoader
 * @tag api, routing, middleware, debug
 * @version 3.2.0+debug.1
 * @author william.r.oak@gmail.com
 * @path src/loaders/routeLoader.ts
 * @summary
 * Discovers, binds, and enforces all API routes with centralized middleware.
 *
 * @description
 * Performs a two-phase routing process:
 *
 * PHASE 1 — Route Discovery
 *   - Recursively scans src/routes/{API_VERSION}/**
 *   - Imports HTTP method handlers (GET.ts, PUT.ts, etc.)
 *   - Builds a hierarchical route metadata tree
 *   - Exposes the tree on app.locals.routeTree
 *
 * PHASE 2 — Express Binding
 *   - Registers handlers with Express
 *   - Applies middleware in a fixed, enforced order
 *   - Applies auth-specific rate limiting structurally
 *   - Registers METHOD_NOT_ALLOWED (405) fallback
 *
 * ENFORCED MIDDLEWARE ORDER
 *   1. Request validation
 *   2. Auth rate limiting (auth routes only)
 *   3. Route authentication (only when route exports `authRequired = true`)
 *   4. Concurrency throttling
 *   5. Centralized cache enforcement
 *   6. Route handler execution
 *
 * DEBUG NOTES
 *   - Enable with ROUTE_LOADER_DEBUG=1
 *   - Adds extremely chatty per-request logs indicating:
 *       * whether the route wrapper ran
 *       * whether auth middleware is in the chain
 *       * whether the actual route handler was entered
 *       * final status code + duration
 *
 * @requires
 * {
 *   "helpers": ["@helpers/config"],
 *   "middleware": [
 *     "@middleware/validate",
 *     "@middleware/throttleMiddleware",
 *     "@middleware/rateLimitMiddleware",
 *     "@middleware/authMiddleware",
 *     "@middleware/cacheMiddleware"
 *   ]
 * }
 */

import path from 'path';
import { pathToFileURL } from 'url';
import { promises as fsp } from 'fs';
import type { Application, NextFunction, Request, Response } from 'express';

import { configGet } from '@helpers/config';
import type { ValidationSchemas } from '@middleware/validate';
import { makeValidator } from '@middleware/validate';
import { throttleMiddleware } from '@middleware/throttleMiddleware';
import { rateLimitMiddleware } from '@middleware/rateLimitMiddleware';
import { cacheMiddleware } from '@middleware/cacheMiddleware';
import { authMiddleware } from '@middleware/authMiddleware';

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];
const METHOD_FILES = new Set(HTTP_METHODS.map((m) => `${m}.ts`));

type RouteHandler = (req: Request, res: Response) => unknown;

type RouteModule = {
  default: RouteHandler;
  schema?: ValidationSchemas;
  authRequired?: boolean;
};

interface RouteNode {
  path: string;
  file?: string;
  handlers: Partial<Record<HttpMethod, RouteHandler>>;
  schemas: Partial<Record<HttpMethod, ValidationSchemas>>;
  children: Record<string, RouteNode>;
  authRequiredByMethod?: Partial<Record<HttpMethod, boolean>>;
}

/* ------------------------------------------------------------------ */
/* Debug helpers                                                      */
/* ------------------------------------------------------------------ */

const ROUTE_LOADER_DEBUG = process.env.ROUTE_LOADER_DEBUG === '1';

function dbg(fields: Record<string, unknown>): void {
  if (!ROUTE_LOADER_DEBUG) return;

  console.log(
    JSON.stringify({
      tag: 'routeLoader',
      t: new Date().toISOString(),
      ...fields,
    }),
  );
}

function getReqId(req: Request): string {
  const hdr = (req.get('x-request-id') ?? '').toString().trim();
  if (hdr) return hdr.slice(0, 128);
  return 'no-x-request-id';
}

function getAuthRateLimitKey(req: Request): string {
  const identifier =
    typeof req.body?.email === 'string'
      ? req.body.email.trim().toLowerCase()
      : typeof req.body?.identifier === 'string'
        ? req.body.identifier.trim().toLowerCase()
        : '';

  return `${req.ip}|${identifier}`;
}

type AuthRateLimitPolicy = {
  max: number;
  windowMs: number;
};

function getAuthRateLimitPolicy(
  routePath: string,
  method: HttpMethod,
): AuthRateLimitPolicy {
  const key = `${method} ${routePath}`;

  switch (key) {
    case 'POST /v1/auth/login':
    case 'PUT /v1/auth/register':
    case 'PUT /v1/auth/passreset/initiate':
    case 'PUT /v1/auth/emailverify/resend':
      return { max: 5, windowMs: 60_000 };

    case 'PUT /v1/auth/refresh':
      return { max: 20, windowMs: 60_000 };

    case 'PUT /v1/auth/emailverify':
    case 'PUT /v1/auth/passreset/verify':
    case 'PUT /v1/auth/passreset/complete':
    case 'DELETE /v1/auth/token':
      return { max: 10, windowMs: 60_000 };

    case 'GET /v1/auth/me':
    case 'GET /v1/auth/eula':
      return { max: 60, windowMs: 60_000 };

    default:
      return { max: 10, windowMs: 60_000 };
  }
}

function tracePoint(name: string, base: Record<string, unknown>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const reqId = getReqId(req);

    dbg({
      phase: 'mw.enter',
      name,
      reqId,
      ...base,
      method: req.method,
      url: req.url,
    });

    return next();
  };
}

/* ------------------------------------------------------------------ */
/* Public API                                                         */

/* ------------------------------------------------------------------ */

export async function loadRoutes(app: Application): Promise<void> {
  const routeTree: Record<string, RouteNode> = {};
  app.locals.routeTree = routeTree;

  const apiVersion = configGet('API_VERSION') ?? 'v1';
  const maxConcurrentRequests = Number(
    configGet('MAX_CONCURRENT_REQUESTS') ?? '10',
  );

  const baseDir = path.join(process.cwd(), 'src', 'routes', apiVersion);

  await scanDirectory({
    dir: baseDir,
    routePath: `/${apiVersion}`,
    routeTree,
  });

  bindExpress({
    app,
    routeTree,
    maxConcurrentRequests,
    apiVersion,
  });

  const endpointCount = countBoundEndpoints(routeTree);
  console.log(
    `RouteLoader: Registered ${endpointCount} endpoint(s) across ${Object.keys(routeTree).length} route node(s)`,
  );
}

/* ------------------------------------------------------------------ */
/* Phase 1 — Route Discovery                                          */

/* ------------------------------------------------------------------ */

async function scanDirectory(args: {
  dir: string;
  routePath: string;
  routeTree: Record<string, RouteNode>;
}): Promise<void> {
  const { dir, routePath, routeTree } = args;

  const node =
    routeTree[routePath] ??
    (routeTree[routePath] = {
      path: routePath,
      handlers: {},
      schemas: {},
      children: {},
      authRequiredByMethod: {},
    });

  const entries = await fsp.readdir(dir, { withFileTypes: true });

  // Import handlers for method files
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!METHOD_FILES.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    const method = entry.name.replace('.ts', '') as HttpMethod;

    const mod = (await import(pathToFileURL(fullPath).href)) as RouteModule;
    if (typeof mod.default !== 'function') {
      throw new Error(`RouteLoader: ${fullPath} missing default export`);
    }

    // First registration wins (prevents accidental overrides)
    if (!node.handlers[method]) {
      node.handlers[method] = mod.default;
      node.schemas[method] = (mod.schema ?? {}) as ValidationSchemas;
      node.authRequiredByMethod = node.authRequiredByMethod ?? {};
      node.authRequiredByMethod[method] = Boolean(mod.authRequired);
      node.file = fullPath;
    }
  }

  // Recurse into child directories
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const childDir = path.join(dir, entry.name);
    const childPath = `${routePath}/${entry.name}`;

    await scanDirectory({
      dir: childDir,
      routePath: childPath,
      routeTree,
    });

    node.children[entry.name] = routeTree[childPath];
  }
}

/* ------------------------------------------------------------------ */
/* Phase 2 — Express Binding                                          */

/* ------------------------------------------------------------------ */

function bindExpress(args: {
  app: Application;
  routeTree: Record<string, RouteNode>;
  maxConcurrentRequests: number;
  apiVersion: string;
}): void {
  const { app, routeTree, maxConcurrentRequests, apiVersion } = args;

  const sortedPaths = Object.keys(routeTree).sort(
    (a, b) => a.split('/').length - b.split('/').length,
  );

  const isAuthRoute = (routePath: string) =>
    routePath.startsWith(`/${apiVersion}/auth`);

  for (const routePath of sortedPaths) {
    const node = routeTree[routePath];
    const supportedMethods = Object.keys(node.handlers) as HttpMethod[];

    for (const method of supportedMethods) {
      const handler = node.handlers[method];
      if (!handler) continue;

      const validator = makeValidator(node.schemas[method] ?? {});
      const authRequired = Boolean(node.authRequiredByMethod?.[method]);
      const authRateLimit = getAuthRateLimitPolicy(routePath, method);

      const baseDebug = {
        routePath,
        method,
        authRequired,
        nodeFile: node.file,
        isAuthRoute: isAuthRoute(routePath),
      };

      const middlewareChain = [
        tracePoint('chain.start', baseDebug),

        validator.request,

        ...(isAuthRoute(routePath)
          ? [
              tracePoint('rateLimit.before', baseDebug),
              rateLimitMiddleware({
                key: getAuthRateLimitKey,
                max: authRateLimit.max,
                windowMs: authRateLimit.windowMs,
              }),
              tracePoint('rateLimit.after', baseDebug),
            ]
          : []),

        ...(authRequired
          ? [
              tracePoint('auth.before', baseDebug),
              authMiddleware(),
              tracePoint('auth.after', baseDebug),
            ]
          : []),

        tracePoint('throttle.before', baseDebug),
        throttleMiddleware(maxConcurrentRequests),
        tracePoint('throttle.after', baseDebug),

        tracePoint('cache.before', baseDebug),
        cacheMiddleware(),
        tracePoint('cache.after', baseDebug),

        async (req: Request, res: Response, next: NextFunction) => {
          const reqId = getReqId(req);
          const start = Date.now();

          dbg({
            phase: 'handler_wrapper.enter',
            reqId,
            ...baseDebug,
            hasAuthorization: Boolean(req.get('authorization')),
            authUserIdPresent: Boolean(
              (req as Request & { auth?: { userId?: string } }).auth?.userId,
            ),
          });

          let finished = false;
          const onFinish = () => {
            if (finished) return;
            finished = true;
            dbg({
              phase: 'handler_wrapper.finish',
              reqId,
              ...baseDebug,
              statusCode: res.statusCode,
              durationMs: Date.now() - start,
              headersSent: res.headersSent,
            });
          };

          res.once('finish', onFinish);
          res.once('close', onFinish);

          try {
            const result = await handler(req, res);

            dbg({
              phase: 'handler_wrapper.after_handler',
              reqId,
              ...baseDebug,
              headersSent: res.headersSent,
              resultType: typeof result,
              result: ROUTE_LOADER_DEBUG ? result : undefined,
            });

            if (!res.headersSent) {
              const shaped = validator.response(result);
              dbg({
                phase: 'handler_wrapper.autorespond',
                reqId,
                ...baseDebug,
                shapedResponse: ROUTE_LOADER_DEBUG ? shaped : undefined,
              });
              return res.json(shaped);
            }
          } catch (err) {
            dbg({
              phase: 'handler_wrapper.error',
              reqId,
              ...baseDebug,
              name: err instanceof Error ? err.name : undefined,
              message: err instanceof Error ? err.message : String(err),
              stack: err instanceof Error ? err.stack : undefined,
            });
            return next(err);
          }
        },
      ];

      (app as Application & Record<string, (...args: unknown[]) => unknown>)[
        method.toLowerCase()
      ](routePath, ...middlewareChain);
    }

    register405(app, routePath, supportedMethods);
  }
}

function countBoundEndpoints(routeTree: Record<string, RouteNode>): number {
  let total = 0;
  for (const node of Object.values(routeTree)) {
    total += Object.keys(node.handlers).length;
  }
  return total;
}

/* ------------------------------------------------------------------ */
/* 405 Fallback                                                       */

/* ------------------------------------------------------------------ */

function register405(
  app: Application,
  routePath: string,
  supportedMethods: string[],
): void {
  app.all(routePath, (req, res, next) => {
    if (supportedMethods.includes(req.method.toUpperCase())) {
      return next();
    }

    return res.status(405).json({
      error: 'METHOD_NOT_ALLOWED',
      message: `${req.method} not allowed for ${routePath}`,
      supportedMethods,
    });
  });
}

/* ------------------------------------------------------------------ */
/* Test Hooks                                                         */
/* ------------------------------------------------------------------ */

export const __test__ = {
  scanDirectory,
  bindExpress,
};
