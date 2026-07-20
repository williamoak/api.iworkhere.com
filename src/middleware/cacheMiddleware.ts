/**
 * @myDocBlock
 * @file cacheMiddleware.ts
 * @internal
 * @module Middleware
 * @tag api
 * @version 1.2.0
 * @author william.r.oak@gmail.com
 * @path src/middleware/cacheMiddleware.ts
 * @summary Centralized HTTP method-aware, tenant-scoped cache middleware with correct DELETE invalidation semantics.
 *
 * @description
 *   This middleware provides centralized, tenant-scoped response caching behavior
 *   based on HTTP method semantics and a deterministic cache key derived from
 *   the request’s tenant (subdomain), base URL, path, and query string.
 *
 *   Caching behavior is applied as follows:
 *
 *     - GET:
 *         Read-through caching. Cached responses are returned immediately
 *         with header `X-Cache: HIT`. Cache misses are stored after handler
 *         execution and returned with `X-Cache: MISS`.
 *
 *     - PUT:
 *         Write-through caching. The response body replaces any existing
 *         cache entry for the request key after successful handler execution.
 *
 *     - DELETE:
 *         Cache invalidation. ALL cached variants of the resource path
 *         (regardless of query string) for the tenant are removed before
 *         handler execution.
 *
 *   Cache keys are constructed from:
 *     - Tenant (req.hostname subdomain)
 *     - API version (req.baseUrl)
 *     - Route path (req.path)
 *     - Query string (if present)
 *
 * @requires
 *   - express
 *   - @cache/cacheStore (must support delWhere)
 */

import type { Request, Response, NextFunction } from 'express';
import { cacheStore } from '@cache/cacheStore';

const DEFAULT_TTL_MS = 30_000;

/* ------------------------------------------------------------------ */
/* Cache Key Helpers                                                   */
/* ------------------------------------------------------------------ */

function extractTenant(req: Request): string {
  return req.hostname.split('.')[0] || 'default';
}

function buildCacheKey(req: Request): string {
  const tenant = extractTenant(req);
  const version = req.baseUrl; // e.g. /v1
  const path = req.path; // e.g. /config
  const query = req.originalUrl.includes('?')
    ? req.originalUrl.split('?')[1]
    : '';

  return `${tenant}:${version}:${path}:${query}`;
}

function buildCachePrefix(req: Request): string {
  const tenant = extractTenant(req);
  const version = req.baseUrl;
  const path = req.path;
  return `${tenant}:${version}:${path}:`;
}

/* ------------------------------------------------------------------ */
/* Middleware                                                         */
/* ------------------------------------------------------------------ */

export function cacheMiddleware(ttlMs = DEFAULT_TTL_MS) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const method = req.method.toUpperCase();

    /* ----------------------------------------------------------
     * GET — read-through
     * ---------------------------------------------------------- */

    if (method === 'GET') {
      const cacheKey = buildCacheKey(req);
      const cached = await cacheStore.get(cacheKey);

      if (cached !== null) {
        res.setHeader('X-Cache', 'HIT');
        return res.json(cached);
      }

      const originalJson = res.json.bind(res);
      res.json = (body: unknown) => {
        cacheStore.set(cacheKey, body, ttlMs);
        res.setHeader('X-Cache', 'MISS');
        return originalJson(body);
      };

      return next();
    }

    /* ----------------------------------------------------------
     * PUT — write-through
     * ---------------------------------------------------------- */

    if (method === 'PUT') {
      const cacheKey = buildCacheKey(req);

      const originalJson = res.json.bind(res);
      res.json = (body: unknown) => {
        cacheStore.set(cacheKey, body, ttlMs);
        return originalJson(body);
      };

      return next();
    }

    /* ----------------------------------------------------------
     * DELETE — invalidate ALL variants of this resource
     * ---------------------------------------------------------- */

    if (method === 'DELETE') {
      const prefix = buildCachePrefix(req);

      await cacheStore.delWhere((key) => key.startsWith(prefix));

      return next();
    }

    return next();
  };
}
