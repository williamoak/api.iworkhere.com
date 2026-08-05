/**
 * @myDocBlock
 * @file tenantResolver.ts
 * @internal
 * @module Middleware
 * @tag api, multi-tenant
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path src/middleware/tenantResolver.ts
 * @summary Utility to dynamically resolve and execute tenant-specific middleware.
 * @description
 *   Provides functions to look up, cache, and execute middleware scripts
 *   found in tenant-specific directories (e.g., /src/middleware/<tenant>/).
 *   Allows for modular, override-based customization of the middleware pipeline.
 * @requestExample none
 * @response none
 * @requires {
 *   "dependencies": ["fs", "path", "url", "express"]
 * }
 */
import type { Request, Response, NextFunction } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Cache to store existence of middleware files: Map<`${tenant}:${middlewareName}`, string | null>
const middlewareCache = new Map<string, string | null>();

export async function resolveTenantMiddleware(
    tenant: string, 
    middlewareName: string, 
    req: Request, 
    res: Response, 
    next: NextFunction
): Promise<boolean> {
    if (!tenant || tenant === 'public' || tenant === 'api') return false;

    const cacheKey = `${tenant}:${middlewareName}`;
    let modulePath = middlewareCache.get(cacheKey);

    if (modulePath === undefined) {
        // Check if file exists
        const fullPath = path.resolve(__dirname, tenant, `${middlewareName}.ts`);
        try {
            await fs.access(fullPath);
            modulePath = fullPath;
            middlewareCache.set(cacheKey, modulePath);
        } catch {
            modulePath = null;
            middlewareCache.set(cacheKey, null);
        }
    }

    if (modulePath) {
        try {
            const module = await import(modulePath);
            if (module.default) {
                await module.default(req, res, next);
                return true;
            }
        } catch (e) {
            console.error(`[DEBUG] Error executing tenant middleware ${cacheKey}:`, e);
        }
    }

    return false;
}

export async function executeTenantSpecific(
    tenant: string,
    middlewareName: string,
    req: Request,
    res: Response,
    _next: NextFunction
): Promise<void> {
    if (!tenant || tenant === 'public' || tenant === 'api') return;

    const cacheKey = `${tenant}:${middlewareName}`;
    let modulePath = middlewareCache.get(cacheKey);

    if (modulePath === undefined) {
        const fullPath = path.resolve(__dirname, tenant, `${middlewareName}.ts`);
        try {
            await fs.access(fullPath);
            modulePath = fullPath;
            middlewareCache.set(cacheKey, modulePath);
        } catch {
            modulePath = null;
            middlewareCache.set(cacheKey, null);
        }
    }

    if (modulePath) {
        try {
            const module = await import(modulePath);
            if (module.default) {
                // Execute without short-circuiting: pass dummy next
                await module.default(req, res, () => {});
            }
        } catch (e) {
            console.error(`[DEBUG] Error executing tenant middleware ${cacheKey}:`, e);
        }
    }
}

export function clearTenantCache(tenant?: string) {
    if (tenant) {
        for (const key of middlewareCache.keys()) {
            if (key.startsWith(`${tenant}:`)) {
                middlewareCache.delete(key);
            }
        }
    } else {
        middlewareCache.clear();
    }
}
