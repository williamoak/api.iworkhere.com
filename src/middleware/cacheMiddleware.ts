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
