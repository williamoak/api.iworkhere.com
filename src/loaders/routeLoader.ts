/**
 * @file routeLoader.ts
 * @external none
 * @module RouteLoader
 * @tag api
 * @version 2.1.0
 * @path src/loaders/routeLoader.ts
 * @summary Recursively loads API routes from src/routes/v1 and registers them with Express.
 * @description
 *   This loader:
 *     1. Recursively walks src/routes/v1/**
 *     2. Converts folder structure into API paths (/v1/.../**)
 *     3. Registers GET/POST/PUT/DELETE/PATCH handlers BEFORE recursion
 *     4. Registers the 405 fallback AFTER recursion
 *     5. Uses ESM-safe dynamic imports ("file://")
 *     6. Uses lightweight, schema-agnostic validation:
 *          • makeValidator(schema).request – always passes through
 *          • makeValidator(schema).response – returns result unchanged
 *          • schema is treated as metadata only
 *
 *   Notes:
 *     • Zod has been fully removed from the project.
 *     • schema.response is ignored (but does not break handlers).
 *     • Final Drizzle validation will be added later.
 */

import fs from "fs";
import path from "path";
import express, { Application, Request, Response, NextFunction } from "express";
import { makeValidator } from "@middleware/validate";
import { pathToFileURL } from "url";

// Supported method filenames
const HTTP_METHODS = ["get", "post", "put", "delete", "patch"] as const;
type HttpMethod = typeof HTTP_METHODS[number];
const ALL_METHODS = HTTP_METHODS.map((m) => m.toUpperCase());
const METHOD_FILES = ALL_METHODS.map((m) => `${m}.ts`);

// Entry point called by server.ts
export async function loadRoutes(app: Application) {
    const baseDir = path.join(process.cwd(), "src/routes/v1");
    await bindDirectory(app, baseDir, "/v1");
}

/**
 * Recursively bind a directory as a route prefix.
 */
async function bindDirectory(app: Application, dir: string, routePath: string) {
    const entries = fs.readdirSync(dir);

    // Step 1 — Determine supported methods
    const supportedMethods = entries
        .filter((f) => METHOD_FILES.includes(f))
        .map((f) => f.replace(".ts", "").toUpperCase());

    const missingMethods = ALL_METHODS.filter(
        (m) => !supportedMethods.includes(m)
    );

    // Step 2 — Register HTTP method handlers FIRST
    for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) continue; // skip; recursion later

        const match = entry.match(/^(GET|POST|PUT|DELETE|PATCH)\.ts$/);
        if (!match) continue;

        const method = match[1].toLowerCase() as HttpMethod;

        // ESM-safe dynamic import
        const moduleUrl = pathToFileURL(fullPath).href;
        const module = await import(moduleUrl);

        const handler = module.default;
        const schema = module.schema ?? {}; // now treated as metadata only

        if (typeof handler !== "function") {
            console.error(`Invalid handler in ${fullPath}: default export must be a function.`);
            continue;
        }

        // Always uses a no-op validator for now
        const validator = makeValidator(schema);

        // Register the handler
        (app[method] as any)(
            routePath,
            validator.request, // always passes through
            async (req: Request, res: Response, next: NextFunction) => {
                try {
                    const result = await handler(req, res);

                    // If handler already sent headers, do nothing
                    if (res.headersSent) return;

                    // Always return object as-is for now
                    const validated = validator.response(result);

                    return res.json(validated);
                } catch (err) {
                    return next(err);
                }
            }
        );
    }

    // Step 3 — Recurse into subfolders
    for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            await bindDirectory(app, fullPath, `${routePath}/${entry}`);
        }
    }

    // Step 4 — AFTER recursion: Register 405 fallback LAST
    register405(app, routePath, supportedMethods, missingMethods);
}

/**
 * 405 fallback — always registered LAST to avoid overriding child routes.
 */
function register405(
    app: Application,
    routePath: string,
    supportedMethods: string[],
    missingMethods: string[]
) {
    app.all(routePath, (req: Request, res: Response, next: NextFunction) => {
        const incoming = req.method.toUpperCase();

        // Pass through if supported
        if (supportedMethods.includes(incoming)) {
            return next();
        }

        return res.status(405).json({
            error: "METHOD_NOT_ALLOWED",
            message:
                supportedMethods.length === 0
                    ? `No supported methods for ${routePath}`
                    : `${incoming} not available for ${routePath}`,
            supportedMethods,
            allowedMethods: missingMethods
        });
    });
}
