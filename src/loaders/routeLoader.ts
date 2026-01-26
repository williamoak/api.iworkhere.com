/**
 * @myDocBlock v2.3
 * @file routeLoader.ts
 * @internal
 * @module loaders/routeLoader
 * @tag api, routing, middleware
 * @version 3.2.0
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
 *   3. Concurrency throttling
 *   4. Centralized cache enforcement
 *   5. Route handler execution
 *
 * @requires
 * {
 *   "helpers": ["@helpers/config"],
 *   "middleware": [
 *     "@middleware/validate",
 *     "@middleware/throttleMiddleware",
 *     "@middleware/rateLimitMiddleware",
 *     "@middleware/cacheMiddleware"
 *   ]
 * }
 */

import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import type { Application, Request, Response, NextFunction } from 'express'

import { configGet } from '@helpers/config'
import { makeValidator } from '@middleware/validate'
import { throttleMiddleware } from '@middleware/throttleMiddleware'
import { rateLimitMiddleware } from '@middleware/rateLimitMiddleware'
import { cacheMiddleware } from '@middleware/cacheMiddleware'

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const
const METHOD_FILES = HTTP_METHODS.map(m => `${m}.ts`)

type RouteHandler = (req: Request, res: Response) => any

interface RouteNode {
    path: string
    file?: string
    handlers: Partial<Record<typeof HTTP_METHODS[number], RouteHandler>>
    children: Record<string, RouteNode>
}

/* ------------------------------------------------------------------ */
/* Public API                                                         */
/* ------------------------------------------------------------------ */

export async function loadRoutes(app: Application): Promise<void> {
    const routeTree: Record<string, RouteNode> = {}
    app.locals.routeTree = routeTree

    const API_VERSION = configGet('API_VERSION') ?? 'v1'
    const MAX_CONCURRENT_REQUESTS = Number(
        configGet('MAX_CONCURRENT_REQUESTS') ?? '10'
    )

    const baseDir = path.join(process.cwd(), 'src', 'routes', API_VERSION)

    await scanDirectory(baseDir, `/${API_VERSION}`, routeTree)
    bindExpress(app, routeTree, MAX_CONCURRENT_REQUESTS)

    console.log(
        `RouteLoader: Registered ${Object.keys(routeTree).length} routes`
    )
}

/* ------------------------------------------------------------------ */
/* Phase 1 — Route Discovery                                          */
/* ------------------------------------------------------------------ */

async function scanDirectory(
    dir: string,
    routePath: string,
    routeTree: Record<string, RouteNode>
): Promise<void> {
    if (!routeTree[routePath]) {
        routeTree[routePath] = {
            path: routePath,
            handlers: {},
            children: {},
        }
    }

    const node = routeTree[routePath]
    const entries = fs.readdirSync(dir)

    for (const entry of entries) {
        const fullPath = path.join(dir, entry)
        if (!METHOD_FILES.includes(entry)) continue

        const method = entry.replace('.ts', '') as keyof RouteNode['handlers']
        const moduleUrl = pathToFileURL(fullPath).href

        const mod = await import(moduleUrl)
        if (typeof mod.default !== 'function') {
            throw new Error(`RouteLoader: ${fullPath} missing default export`)
        }

        if (!node.handlers[method]) {
            node.handlers[method] = mod.default
            node.file = fullPath
        }
    }

    for (const entry of entries) {
        const fullPath = path.join(dir, entry)
        if (!fs.statSync(fullPath).isDirectory()) continue

        const childPath = `${routePath}/${entry}`
        await scanDirectory(fullPath, childPath, routeTree)
        node.children[entry] = routeTree[childPath]
    }
}

/* ------------------------------------------------------------------ */
/* Phase 2 — Express Binding                                          */
/* ------------------------------------------------------------------ */

function bindExpress(
    app: Application,
    routeTree: Record<string, RouteNode>,
    maxConcurrentRequests: number
): void {
    const sortedPaths = Object.keys(routeTree).sort(
        (a, b) => a.split('/').length - b.split('/').length
    )

    const isAuthRoute = (path: string) => path.startsWith('/v1/auth')

    for (const routePath of sortedPaths) {
        const node = routeTree[routePath]
        const supportedMethods = Object.keys(node.handlers)

        for (const method of supportedMethods) {
            const handler = node.handlers[method as keyof typeof node.handlers]
            if (!handler) continue

            const validator = makeValidator({})

            const middlewareChain = [
                    validator.request,

                    ...(isAuthRoute(routePath)
                        ? [
                            rateLimitMiddleware({
                                key: req =>
                                    req.ip ||
                                    (req.body?.email ?? req.body?.identifier ?? ''),
                                max: 5,
                                windowMs: 60_000,
                            }),
                        ]
                        : []),

                    throttleMiddleware(maxConcurrentRequests),
                    cacheMiddleware(),

                    async (req: Request, res: Response, next: NextFunction) => {
                        try {
                            const result = await handler(req, res)
                            if (!res.headersSent) {
                                return res.json(validator.response(result))
                            }
                        } catch (err) {
                            return next(err)
                        }
                    },
                ]

            ;(app as any)[method.toLowerCase()](routePath, ...middlewareChain)
        }

        register405(app, routePath, supportedMethods)
    }
}

/* ------------------------------------------------------------------ */
/* 405 Fallback                                                       */
/* ------------------------------------------------------------------ */

function register405(
    app: Application,
    routePath: string,
    supportedMethods: string[]
): void {
    app.all(routePath, (req, res, next) => {
        if (supportedMethods.includes(req.method.toUpperCase())) {
            return next()
        }

        return res.status(405).json({
            error: 'METHOD_NOT_ALLOWED',
            message: `${req.method} not allowed for ${routePath}`,
            supportedMethods,
        })
    })
}

/* ------------------------------------------------------------------ */
/* Test Hooks                                                         */
/* ------------------------------------------------------------------ */

export const __test__ = {
    scanDirectory,
    bindExpress,
}
