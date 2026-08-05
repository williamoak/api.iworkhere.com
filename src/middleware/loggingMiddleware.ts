import { logger } from '@helpers/logger';

/**
 * @myDocBlock
 * @file loggingMiddleware.ts
 * @internal
 * @module Middleware
 * @tag api, logging
 * @version 1.0.1
 * @author william.r.oak@gmail.com
 * @path src/middleware/loggingMiddleware.ts
 * @summary Generic request logging middleware with tenant-specific additive overrides.
 * @description
 *   Logs generic request information to the console and attempts to resolve
 *   and execute tenant-specific logging middleware from /src/middleware/<tenant>/.
 *   Allows for unified audit trails across all tenants.
 * @query {}
 * @requestExample none
 * @response none
 * @requires {
 *   "dependencies": ["express", "@middleware/tenantResolver"]
 * }
 */
import type { Request, Response, NextFunction } from 'express';
import { executeTenantSpecific } from '@middleware/tenantResolver';
;

export function loggingMiddleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
        const tenant = (req as any).tenant;

        // 1. Base Implementation (Generic Logging)
        const userId = res.locals.visitUserId || (req as any).auth?.userId || null;
        logger.log(`[Generic Logging] ${req.method} ${req.path} for tenant: ${tenant}, userId: ${userId}`);

        // 2. Execute tenant-specific additive middleware
        await executeTenantSpecific(tenant, 'loggingMiddleware', req, res, next);

        next();
    };
}
