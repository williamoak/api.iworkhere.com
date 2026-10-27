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
import { isValidTenantSchemaName } from '@db/tenantSchema';
import { config } from '@helpers/config';


export function tenantMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const debugEnabled = process.env.TENANT_MIDDLEWARE_DEBUG === 'true';
    const debug = (message: string, details: Record<string, unknown> = {}) => {
        if (debugEnabled) {
            logger.log(`[TENANT_RESOLVER]: ${message} ${JSON.stringify(details)}`, true);
        }
    };

    // 1. Try determining tenant from X-Tenant header first
    let tenant = 'localhost';
    let tenantSource = 'default:localhost';
    const xTenant = req.headers['x-tenant'] as string;
    debug('request received', {
        method: req.method,
        path: req.path,
        hostname: req.hostname,
        origin: req.headers.origin || null,
        referer: req.headers.referer || null,
        xTenantPresent: Boolean(xTenant),
        appKeyPresent: Boolean(req.query.app_key || (req.body as any)?.app_key),
    });

    if (xTenant) {
        tenant = xTenant.split('.')[0];
        tenantSource = 'x-tenant';
        debug('tenant extracted from X-Tenant', { rawPrefix: tenant });
    } else {
        // 2. Try determining tenant from headers (Origin, Referer, Access-Control-Allow-Origin)
        const originHeader = (req.headers['access-control-allow-origin'] as string) ||
                             (req.headers['access-control-allow_origin'] as string) ||
                             req.headers.origin ||
                             req.headers.referer || 
                             '';
        
        debug('headers selected for tenant lookup', {
            originHeader: originHeader || null,
            source: req.headers['access-control-allow-origin'] || req.headers['access-control-allow_origin']
                ? 'access-control-allow-origin'
                : req.headers.origin
                    ? 'origin'
                    : req.headers.referer
                        ? 'referer'
                        : 'none',
        });

        if (originHeader) {
            // Robust extraction: find the part between "https://" or "http://" and the first "."
            // If no protocol, just take the first part of the domain.
            const protocolMatch = originHeader.match(/https?:\/\/([^\.]+)\./);
            if (protocolMatch) {
                tenant = protocolMatch[1];
                tenantSource = 'origin-or-referer:protocol';
            } else {
                const domainParts = originHeader.replace(/^https?:\/\//, '').split('.');
                if (domainParts.length > 2) {
                    tenant = domainParts[0];
                    tenantSource = 'origin-or-referer:hostname';
                } else if (domainParts.length === 2) {
                    tenant = domainParts[0];
                    tenantSource = 'origin-or-referer:domain';
                }
            }
            debug('tenant extracted from origin/referer', { tenant, tenantSource });
        }
    }

    // The API hostname identifies the service, not a tenant. In particular,
    // names such as api-dev contain a hyphen and cannot be PostgreSQL schema
    // identifiers. Auth requests can resolve their application from app_key,
    // Origin, or Referer instead.
    const hostname = req.hostname.toLowerCase();
    const hostnameLabel = hostname.split('.')[0];
    // Use the layered configuration so API-host detection remains correct when
    // dotenv values are loaded after module imports or when a proxy rewrites
    // the request hostname.
    const configuredApiHostname = (config.APP_KEY || '').trim().toLowerCase().split('/')[0];
    const isConfiguredApiHostname = configuredApiHostname !== '' && (
      hostname === configuredApiHostname || hostnameLabel === configuredApiHostname.split('.')[0]
    );
    const configuredProxyHostname = configuredApiHostname.includes('.')
      ? `public.${configuredApiHostname.split('.').slice(1).join('.')}`
      : '';
    const isConfiguredProxyHostname = configuredProxyHostname !== '' && hostname === configuredProxyHostname;
    const isApiTenant = tenantSource !== 'x-tenant' && (tenant === 'api' || tenant.startsWith('api-'));
    const isApiHostname = isConfiguredApiHostname || hostnameLabel === 'api' || hostnameLabel.startsWith('api-');

    if (isApiHostname || isApiTenant || isConfiguredProxyHostname) {
      tenant = 'public';
      tenantSource = 'api-hostname:public';
    }

    // If still not determined or default, check hostname as fallback
    if (tenant === 'localhost') {
        const parts = hostname.split('.');
        
        if (parts.length > 2) {
            tenant = parts[0];
            tenantSource = 'request-hostname';
        } else if (parts.length === 2) {
            tenant = parts[0];
            tenantSource = 'request-domain';
        }
    }

    // 3. Fallback to app_key when no tenant could be derived from the request.
    if (tenant === 'localhost') {
        const appKey = req.query.app_key as string || (req.body as any)?.app_key;
        if (appKey) {
            tenant = appKey.split('.')[0];
            tenantSource = 'app_key';
        }
    }

    debug('tenant before normalization', { tenant, tenantSource, hostname, hostnameLabel, isApiHostname });
    tenant = tenant.toLowerCase();
    if (!isValidTenantSchemaName(tenant)) {
      debug('tenant rejected', {
          tenant,
          tenantSource,
          reason: 'invalid tenant schema name',
      });
      return res.status(400).json({
        error: 'INVALID_TENANT',
        message: 'Tenant identifier is invalid(1)',
      });
    }

    debug('tenant accepted', { tenant, tenantSource });
    logger.log(`Tenant determined: ${tenant}`);
    (req as any).tenant = tenant;

    next();
  };
}
