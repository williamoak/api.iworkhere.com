/**
 * @myDocBlock
 * @file tenantResolver.ts
 * @internal
 * @module Middleware
 * @tag api, multi-tenant
 * @version 1.0.1
 * @author william.r.oak@gmail.com
 * @path src/middleware/tenantResolver.ts
 * @summary Utility to dynamically resolve and execute tenant-specific middleware.
 * @description
 *   Provides functions to look up, cache, and execute middleware scripts
 *   found in tenant-specific directories (e.g., /src/middleware/<tenant>/).
 *   Allows for modular, override-based customization of the middleware pipeline.
 * @query {}
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
import { logger } from '@helpers/logger';

const getCache = () => {
    if (!(global as any).__tenantMiddlewareCache) {
        (global as any).__tenantMiddlewareCache = new Map<string, string | null>();
    }
    return (global as any).__tenantMiddlewareCache as Map<string, string | null>;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function resolveTenantMiddleware(
    tenant: string, 
    middlewareName: string, 
    req: Request, 
    res: Response, 
    next: NextFunction
): Promise<boolean> {
    if (!tenant || tenant === 'public' || tenant === 'api') return false;

    const cacheKey = `${tenant}:${middlewareName}`;
    let modulePath = getCache().get(cacheKey);

    if (modulePath === undefined) {
        // Check if file exists
        const fullPath = path.resolve(__dirname, tenant, `${middlewareName}.ts`);
        logger.log(`[DEBUG] Looking for middleware ${middlewareName} for tenant ${tenant} at ${fullPath}`);
        try {
            await fs.access(fullPath);
            modulePath = fullPath;
            getCache().set(cacheKey, modulePath);
        } catch {
            modulePath = null;
            getCache().set(cacheKey, null);
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
            logger.error(`[DEBUG] Error executing tenant middleware ${cacheKey}:`, e);
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
    let modulePath = getCache().get(cacheKey);

    if (modulePath === undefined) {
        const fullPath = path.resolve(__dirname, tenant, `${middlewareName}.ts`);
        try {
            await fs.access(fullPath);
            modulePath = fullPath;
            getCache().set(cacheKey, modulePath);
        } catch {
            modulePath = null;
            getCache().set(cacheKey, null);
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
            logger.error(`[DEBUG] Error executing tenant middleware ${cacheKey}:`, e);
        }
    }
}

export function clearTenantCache(tenant?: string) {
    if (tenant) {
        for (const key of getCache().keys()) {
            if (key.startsWith(`${tenant}:`)) {
                getCache().delete(key);
            }
        }
    } else {
        getCache().clear();
    }
}
