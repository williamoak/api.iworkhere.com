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
import { logger } from '@helpers/logger';


export function tenantMiddleware() {
  return async (req: Request, _res: Response, next: NextFunction) => {
    // 1. Try determining tenant from X-Tenant header first
    let tenant = 'localhost';
    const xTenant = req.headers['x-tenant'] as string;
    if (xTenant) {
        tenant = xTenant.split('.')[0];
    } else {
        // 2. Try determining tenant from headers (Origin, Referer, Access-Control-Allow-Origin)
        const originHeader = (req.headers['access-control-allow-origin'] as string) ||
                             (req.headers['access-control-allow_origin'] as string) ||
                             req.headers.origin ||
                             req.headers.referer || 
                             '';
        
        logger.warn(`[DEBUG] [TENANT_RESOLVER] Request headers for tenant check: Host=${req.hostname}, Origin=${req.headers.origin}, Referer=${req.headers.referer}, ACAO=${req.headers['access-control-allow-origin'] || req.headers['access-control-allow_origin']}`);
        logger.warn(`[DEBUG] [TENANT_RESOLVER] All headers: ${JSON.stringify(req.headers)}`);

        if (originHeader) {
            // Robust extraction: find the part between "https://" or "http://" and the first "."
            // If no protocol, just take the first part of the domain.
            const protocolMatch = originHeader.match(/https?:\/\/([^\.]+)\./);
            if (protocolMatch) {
                tenant = protocolMatch[1];
            } else {
                const domainParts = originHeader.replace(/^https?:\/\//, '').split('.');
                if (domainParts.length > 2) {
                    tenant = domainParts[0];
                } else if (domainParts.length === 2 && domainParts[0] !== 'api' && domainParts[0] !== 'localhost' && domainParts[0] !== 'iworkhere') {
                    tenant = domainParts[0];
                }
            }
        }
    }

    // If still not determined or default, check hostname as fallback
    if (tenant === 'localhost') {
        const hostname = req.hostname;
        const parts = hostname.split('.');
        
        if (parts.length > 2) {
            tenant = parts[0];
        } else if (parts.length === 2 && parts[0] !== 'api' && parts[0] !== 'localhost') {
            tenant = parts[0];
        }
    }

    // 3. Fallback to app_key if tenant is still generic
    if (tenant === 'localhost' || tenant === 'api' || tenant === 'public' || tenant === 'iworkhere') {
        const appKey = req.query.app_key as string || (req.body as any)?.app_key;
        if (appKey) {
            tenant = appKey.split('.')[0];
        }
    }

    // 3. Final safety: if it's still generic or the main domain, default to 'localhost'
    if (tenant === 'api' || tenant === 'public' || tenant === 'iworkhere') {
        logger.warn(`[DEBUG] [TENANT_RESOLVER] Tenant defaulted to localhost. Hostname: ${req.hostname}, Headers: Origin=${req.headers.origin}, Referer=${req.headers.referer}`);
        tenant = 'localhost';
    }
    
    // Safety check: ignore 'accounts' or common third-party domains
    if (tenant === 'accounts' || tenant === 'google') tenant = 'public';

    logger.log(`Tenant determined: ${tenant}`);
    (req as any).tenant = tenant;
    
    next();
  };
}
