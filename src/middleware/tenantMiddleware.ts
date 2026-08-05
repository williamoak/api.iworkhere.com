import { logger } from '@helpers/logger';

/**
 * @myDocBlock
 * @file tenantMiddleware.ts
 * @internal
 * @module Middleware
 * @tag api, multi-tenant
 * @version 1.0.1
 * @author william.r.oak@gmail.com
 * @path src/middleware/tenantMiddleware.ts
 * @summary Middleware to identify the tenant based on request context.
 * @description
 *   Parses the request hostname, referer, or app_key to identify the
 *   tenant identifier. This identifier is attached to req.tenant
 *   for downstream use by tenantTransaction and other middleware.
 * @query {
 *   "app_key": {
 *     "type": "string",
 *     "required": false,
 *     "description": "Optional application key used to derive tenant if hostname resolution fails"
 *   }
 * }
 * @requestExample none
 * @response none
 * @requires {
 *   "description": "Requires Express Request object"
 * }
 */
import type { Request, Response, NextFunction } from 'express';
;

export function tenantMiddleware() {
  return async (req: Request, _res: Response, next: NextFunction) => {
    // 1. Try determining tenant from origin/referer/hostname first
    const origin = req.headers.origin || req.headers.referer || '';
    const hostname = origin ? new URL(origin).hostname : req.hostname;
    const parts = hostname.split('.');
    
    logger.log(`[DEBUG] tenantMiddleware: hostname=${hostname}, parts=${JSON.stringify(parts)}`);
    
    let tenant = 'public';
    if (parts.length > 2) {
        tenant = parts[0];
    } else if (parts.length === 2 && parts[0] !== 'api' && parts[0] !== 'localhost') {
        tenant = parts[0];
    }
    
    // 2. If still public (not found in hostname), fallback to app_key
    if (tenant === 'public') {
        const appKey = req.query.app_key as string || (req.body as any)?.app_key;
        if (appKey) {
            tenant = appKey.split('.')[0];
        }
    }
    
    // Safety check: ignore 'accounts' or common third-party domains
    if (tenant === 'accounts' || tenant === 'google') tenant = 'public';

    logger.log(`[DEBUG] tenantMiddleware: determined tenant=${tenant}`);
    (req as any).tenant = tenant;
    
    next();
  };
}
