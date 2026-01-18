/**
 * @file routeLoader.ts
 * @internal
 * @module RouteLoader
 * @tag api
 * @version 3.1.0
 * @author: william.r.oak@gmail.com
 * @path src/loaders/routeLoader.ts
 * @summary Hierarchical route metadata builder and Express route binder with centralized caching and throttling.
 * @description
 *   This loader performs a complete multi-phase route setup with
 *   centralized cross-cutting concerns applied structurally at bind time.
 *
 *   PHASE 1 — Metadata Construction
 *     - Recursively scans src/routes/{API_VERSION}/**
 *     - Converts directory structure → canonical Express paths (/{API_VERSION}/...)
 *     - Dynamically imports GET.ts, POST.ts, PUT.ts, DELETE.ts, PATCH.ts
 *     - Builds a hierarchical RouteNode tree with parent→child relationships
 *     - Stores the entire tree in app.locals.routeTree
 *
 *   PHASE 2 — Express Binding
 *     - Registers all discovered handlers with Express
 *     - Applies middleware in a fixed, enforced order:
 *
 *         1. Request validation
 *         2. Concurrency throttling (env-driven)
 *         3. Centralized cache enforcement (method-aware)
 *         4. Route handler execution
 *
 *     - Registers METHOD_NOT_ALLOWED (405) fallback last
 *
 *   CACHING BEHAVIOR (structural, middleware-enforced)
 *     - GET    → read-through cache (serve cached response when present)
 *     - PUT    → write-through cache (update cache on successful response)
 *     - DELETE → cache invalidation (remove cached entry)
 *
 *   THROTTLING BEHAVIOR
 *     - Limits in-flight concurrent requests per route and HTTP method
 *     - Configured via MAX_CONCURRENT_REQUESTS environment variable
 *     - Protects cache and database layers from thundering-herd scenarios
 *
 *   This design eliminates all internal HTTP calls between routes.
 *   Parent routes (e.g., /{API_VERSION}/health) may call children directly via:
 *
 *       const node = req.app.locals.routeTree["/{API_VERSION}/health"];
 *       const result = await node.children["database"].handlers.GET(req, res);
 *
 *   Fully compatible with the existing appFactory, middleware, and validator
 *   architecture. Route files remain cache- and throttle-agnostic.
 *
 * @requestExample
 *   {
 *     "example": "Route metadata for /{API_VERSION}/health",
 *     "node": {
 *       "path": "/{API_VERSION}/health",
 *       "file": "src/routes/{API_VERSION}/health/GET.ts",
 *       "handlers": ["GET"],
 *       "children": ["database", "network"]
 *     }
 *   }
 *
 * @response
 *   {
 *     "status": "ok",
 *     "message": "Routes loaded, middleware bound, and metadata tree constructed.",
 *     "routes": 42
 *   }
 *
 * @requires
 *   - src/helpers/config.ts
 *   - src/middleware/validate.ts
 *   - src/middleware/cacheMiddleware.ts
 *   - src/middleware/throttleMiddleware.ts
 *   - src/routes/{API_VERSION}/**
 */

import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { configGet } from "@helpers/config";
import { makeValidator } from "@middleware/validate";
import { cacheMiddleware } from "@middleware/cacheMiddleware";
import { throttleMiddleware } from "@middleware/throttleMiddleware";
import { Application, Request, Response, NextFunction } from "express";

const MAX_CONCURRENT_REQUESTS = Number(
    configGet("MAX_CONCURRENT_REQUESTS") ?? "10"
);

// Supported method filenames
const HTTP_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"] as const;
const METHOD_FILES = HTTP_METHODS.map((m) => `${m}.ts`);

type RouteHandler = (req: Request, res: Response) => any;

interface RouteNode {
    path: string;
    file?: string; // points to latest-imported method file for debugging
    handlers: {
        GET?: RouteHandler;
        POST?: RouteHandler;
        PUT?: RouteHandler;
        DELETE?: RouteHandler;
        PATCH?: RouteHandler;
    };
    children: Record<string, RouteNode>;
}

/**
 * Entry point for the entire routing process.
 */
export async function loadRoutes(app: Application): Promise<void> {
    const routeTree: Record<string, RouteNode> = {};

    // Expose route metadata to all handlers
    app.locals.routeTree = routeTree;

    const API_VERSION = configGet("API_VERSION") ?? "v1";
    const baseDir = path.join(
        process.cwd(),
        "src",
        "routes",
        API_VERSION
    );

    await scanDirectory(baseDir, `/${API_VERSION}`, routeTree);

    bindExpress(app, routeTree);

    const routeCount = Object.keys(routeTree).length;
    console.log(`RouteLoader: Registered ${routeCount} routes`);
}

/**
 * Recursively walks directories and builds metadata structure.
 */
async function scanDirectory(
    dir: string,
    routePath: string,
    routeTree: Record<string, RouteNode>
): Promise<void> {

    // Ensure current RouteNode exists
    if (!routeTree[routePath]) {
        routeTree[routePath] = {
            path: routePath,
            handlers: {},
            children: {}
        };
    }

    const node = routeTree[routePath];
    const entries = fs.readdirSync(dir);

    // Register handlers (GET.ts, POST.ts, etc.)
    for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const isMethodFile = METHOD_FILES.includes(entry);

        if (!isMethodFile) continue;

        const method = entry.replace(".ts", "") as keyof RouteNode["handlers"];
        const moduleUrl = pathToFileURL(fullPath).href;

        try {
            const mod = await import(moduleUrl);

            if (typeof mod.default !== "function") {
                console.error(
                    `RouteLoader: ${fullPath} missing default export function.`
                );
                continue;
            }

            if (node.handlers[method]) {
                console.error(
                    `RouteLoader: Duplicate handler for ${method} at ${routePath}. Keeping first.`
                );
                continue;
            }

            node.handlers[method] = mod.default;
            node.file = fullPath;
        } catch (err) {
            console.error(`RouteLoader: Failed to import ${fullPath}`, err);
        }
    }

    // Recurse into child directories
    for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        if (!fs.statSync(fullPath).isDirectory()) continue;

        const childPath = `${routePath}/${entry}`;
        await scanDirectory(fullPath, childPath, routeTree);

        // Link as child
        node.children[entry] = routeTree[childPath];
    }
}

/**
 * Second phase: bind all metadata to Express routes.
 */
function bindExpress(
    app: Application,
    routeTree: Record<string, RouteNode>
): void {

    // Sort routes by path depth: shallow → deep (ensures correct override behavior)
    const sortedPaths = Object.keys(routeTree).sort(
        (a, b) => a.split("/").length - b.split("/").length
    );

    for (const routePath of sortedPaths) {
        const node = routeTree[routePath];
        const supportedMethods = Object.keys(node.handlers);
        const missingMethods = HTTP_METHODS.filter(
            (m) => !supportedMethods.includes(m)
        );

        // Register HTTP method handlers FIRST
        for (const method of supportedMethods) {
            const handler = node.handlers[method as keyof RouteNode["handlers"]];
            if (!handler) continue;

            const schema = {}; // metadata-only placeholder
            const validator = makeValidator(schema);

            (app as any)[method.toLowerCase()](
                routePath,

                // 1. Request validation
                validator.request,

                // 2. Concurrency throttling (before cache / DB)
                throttleMiddleware(MAX_CONCURRENT_REQUESTS),

                // 3. Centralized cache enforcement (method-aware)
                cacheMiddleware(),

                // 4. Route handler
                async (req: Request, res: Response, next: NextFunction) => {
                    try {
                        const result = await handler(req, res);

                        if (!res.headersSent) {
                            const validated = validator.response(result);
                            return res.json(validated);
                        }
                    } catch (err) {
                        return next(err);
                    }
                }
            );
        }

        // Register fallback 405 LAST
        register405(app, routePath, supportedMethods, missingMethods);
    }
}

/**
 * METHOD_NOT_ALLOWED fallback (registered last).
 */
function register405(
    app: Application,
    routePath: string,
    supportedMethods: string[],
    missingMethods: string[]
): void {
    app.all(routePath, (req: Request, res: Response, next: NextFunction) => {
        const incoming = req.method.toUpperCase();

        // If supported, allow next() to deliver handler
        if (supportedMethods.includes(incoming)) {
            return next();
        }

        return res.status(405).json({
            error: "METHOD_NOT_ALLOWED",
            message:
                supportedMethods.length === 0
                    ? `No supported methods for ${routePath}`
                    : `${incoming} not allowed for ${routePath}`,
            supportedMethods,
            allowedMethods: missingMethods
        });
    });
}
