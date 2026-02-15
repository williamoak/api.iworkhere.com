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
 *   3. Route authentication (only when route exports `authRequired = true`)
 *   4. Concurrency throttling
 *   5. Centralized cache enforcement
 *   6. Route handler execution
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

import path from 'path'
import {pathToFileURL} from 'url'
import {promises as fsp} from 'fs'
import type {Application, NextFunction, Request, Response} from 'express'

import {configGet} from '@helpers/config'
import type {ValidationSchemas} from '@middleware/validate'
import {makeValidator} from '@middleware/validate'
import {throttleMiddleware} from '@middleware/throttleMiddleware'
import {rateLimitMiddleware} from '@middleware/rateLimitMiddleware'
import {cacheMiddleware} from '@middleware/cacheMiddleware'
import {authMiddleware} from '@middleware/authMiddleware'

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const
type HttpMethod = (typeof HTTP_METHODS)[number]
const METHOD_FILES = new Set(HTTP_METHODS.map((m) => `${m}.ts`))

type RouteHandler = (req: Request, res: Response) => any

type RouteModule = {
    default: RouteHandler
    schema?: ValidationSchemas
    authRequired?: boolean
}

interface RouteNode {
    path: string
    file?: string
    handlers: Partial<Record<HttpMethod, RouteHandler>>
    schemas: Partial<Record<HttpMethod, ValidationSchemas>>
    children: Record<string, RouteNode>
    authRequiredByMethod?: Partial<Record<HttpMethod, boolean>>
}

/* ------------------------------------------------------------------ */
/* Public API                                                         */

/* ------------------------------------------------------------------ */

export async function loadRoutes(app: Application): Promise<void> {
    const routeTree: Record<string, RouteNode> = {}
    app.locals.routeTree = routeTree

    const apiVersion = configGet('API_VERSION') ?? 'v1'
    const maxConcurrentRequests = Number(
        configGet('MAX_CONCURRENT_REQUESTS') ?? '10'
    )

    const baseDir = path.join(process.cwd(), 'src', 'routes', apiVersion)

    await scanDirectory({
        dir: baseDir,
        routePath: `/${apiVersion}`,
        routeTree,
    })

    bindExpress({
        app,
        routeTree,
        maxConcurrentRequests,
        apiVersion,
    })

    const endpointCount = countBoundEndpoints(routeTree)
    console.log(
        `RouteLoader: Registered ${endpointCount} endpoint(s) across ${Object.keys(routeTree).length} route node(s)`
    )
}

/* ------------------------------------------------------------------ */
/* Phase 1 — Route Discovery                                          */

/* ------------------------------------------------------------------ */

async function scanDirectory(args: {
    dir: string
    routePath: string
    routeTree: Record<string, RouteNode>
}): Promise<void> {
    const {dir, routePath, routeTree} = args

    const node =
        routeTree[routePath] ??
        (routeTree[routePath] = {
            path: routePath,
            handlers: {},
            schemas: {},
            children: {},
            authRequiredByMethod: {},
        })

    const entries = await fsp.readdir(dir, {withFileTypes: true})

    // Import handlers for method files
    for (const entry of entries) {
        if (!entry.isFile()) continue
        if (!METHOD_FILES.has(entry.name)) continue

        const fullPath = path.join(dir, entry.name)
        const method = entry.name.replace('.ts', '') as HttpMethod

        const mod = (await import(pathToFileURL(fullPath).href)) as RouteModule
        if (typeof mod.default !== 'function') {
            throw new Error(`RouteLoader: ${fullPath} missing default export`)
        }

        // First registration wins (prevents accidental overrides)
        if (!node.handlers[method]) {
            node.handlers[method] = mod.default
            node.schemas[method] = (mod.schema ?? {}) as ValidationSchemas
            node.authRequiredByMethod = node.authRequiredByMethod ?? {}
            node.authRequiredByMethod[method] = Boolean(mod.authRequired)
            node.file = fullPath
        }
    }

    // Recurse into child directories
    for (const entry of entries) {
        if (!entry.isDirectory()) continue

        const childDir = path.join(dir, entry.name)
        const childPath = `${routePath}/${entry.name}`

        await scanDirectory({
            dir: childDir,
            routePath: childPath,
            routeTree,
        })

        node.children[entry.name] = routeTree[childPath]
    }
}

/* ------------------------------------------------------------------ */
/* Phase 2 — Express Binding                                          */

/* ------------------------------------------------------------------ */

function bindExpress(args: {
    app: Application
    routeTree: Record<string, RouteNode>
    maxConcurrentRequests: number
    apiVersion: string
}): void {
    const {app, routeTree, maxConcurrentRequests, apiVersion} = args

    const sortedPaths = Object.keys(routeTree).sort(
        (a, b) => a.split('/').length - b.split('/').length
    )

    const isAuthRoute = (routePath: string) =>
        routePath.startsWith(`/${apiVersion}/auth`)

    for (const routePath of sortedPaths) {
        const node = routeTree[routePath]
        const supportedMethods = Object.keys(node.handlers) as HttpMethod[]

        for (const method of supportedMethods) {
            const handler = node.handlers[method]
            if (!handler) continue

            const validator = makeValidator(node.schemas[method] ?? {})
            const authRequired = Boolean(node.authRequiredByMethod?.[method])

            const middlewareChain = [
                    validator.request,

                    ...(isAuthRoute(routePath)
                        ? [
                            rateLimitMiddleware({
                                key: (req) =>
                                    req.ip ||
                                    (req.body?.email ??
                                        req.body?.identifier ??
                                        ''),
                                max: 5,
                                windowMs: 60_000,
                            }),
                        ]
                        : []),

                    ...(authRequired ? [authMiddleware()] : []),

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

function countBoundEndpoints(routeTree: Record<string, RouteNode>): number {
    let total = 0
    for (const node of Object.values(routeTree)) {
        total += Object.keys(node.handlers).length
    }
    return total
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