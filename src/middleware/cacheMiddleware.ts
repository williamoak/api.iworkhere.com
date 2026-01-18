/**
 * @myDocBlock
 * @file cacheMiddleware.ts
 * @internal
 * @module Middleware
 * @tag api
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path src/middleware/cacheMiddleware.ts
 * @summary Centralized HTTP method-aware cache middleware with read-through, write-through, and invalidation semantics.
 * @description
 *   This middleware provides centralized response caching behavior based on
 *   HTTP method semantics and a deterministic cache key derived from the
 *   request’s base URL, path, and query string.
 *
 *   Caching behavior is applied as follows:
 *
 *     - GET:
 *         Implements read-through caching. If a cached response is present,
 *         it is returned immediately with header `X-Cache: HIT`.
 *         On cache miss, the response body is cached after the handler
 *         executes and returned with header `X-Cache: MISS`.
 *
 *     - PUT:
 *         Implements write-through caching. The response body is cached
 *         after successful handler execution, updating any existing entry.
 *
 *     - DELETE:
 *         Implements cache invalidation. The cache entry corresponding to
 *         the request key is removed before handler execution.
 *
 *   Cache keys are constructed from:
 *     - API version (req.baseUrl)
 *     - Route path (req.path)
 *     - Query string (if present)
 *
 *   This middleware is designed to be method-aware and route-agnostic.
 *   Route handlers remain unaware of caching behavior.
 *
 *   The underlying cache store is process-local unless the configured
 *   cacheStore implementation provides distributed persistence.
 *
 * @query
 *   {}
 *
 * @requestExample
 *   {
 *     "method": "GET",
 *     "path": "/v1/health",
 *     "query": {
 *       "detail": "full"
 *     }
 *   }
 *
 * @response
 *   {
 *     "success": {
 *       "status": 200,
 *       "headers": {
 *         "X-Cache": "HIT | MISS"
 *       },
 *       "description": "Cached or freshly generated response body"
 *     }
 *   }
 *
 * @requires
 *   - express
 *   - @cache/cacheStore
 */

import type { Request, Response, NextFunction } from 'express'
import { cacheStore } from '@cache/cacheStore'

const DEFAULT_TTL_MS = 30_000

function buildCacheKey(req: Request): string {
    const version = req.baseUrl           // e.g. /v1
    const path = req.path                 // e.g. /health
    const query = req.originalUrl.includes('?')
        ? req.originalUrl.split('?')[1]
        : ''

    return `${version}:${path}:${query}`
}

export function cacheMiddleware(ttlMs = DEFAULT_TTL_MS) {
    return (req: Request, res: Response, next: NextFunction) => {
        const method = req.method.toUpperCase()
        const cacheKey = buildCacheKey(req)

        /* ---------- GET : read-through ---------- */
        if (method === 'GET') {
            const cached = cacheStore.get(cacheKey)
            if (cached !== null) {
                res.setHeader('X-Cache', 'HIT')
                return res.json(cached)
            }

            // Intercept response to populate cache
            const originalJson = res.json.bind(res)
            res.json = (body: unknown) => {
                cacheStore.set(cacheKey, body, ttlMs)
                res.setHeader('X-Cache', 'MISS')
                return originalJson(body)
            }

            return next()
        }

        /* ---------- PUT : write-through ---------- */
        if (method === 'PUT') {
            const originalJson = res.json.bind(res)
            res.json = (body: unknown) => {
                cacheStore.set(cacheKey, body, ttlMs)
                return originalJson(body)
            }

            return next()
        }

        /* ---------- DELETE : invalidate ---------- */
        if (method === 'DELETE') {
            cacheStore.del(cacheKey)
            return next()
        }

        return next()
    }
}
