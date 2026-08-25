import { logger } from '@helpers/logger';

/**
 * @myDocBlock
 * @file loggingMiddleware.ts
 * @internal
 * @module Middleware
 * @tag api, logging
 * @version 1.0.3
 * @author william.r.oak@gmail.com
 * @path src/middleware/loggingMiddleware.ts
 * @summary Generic request logging middleware with tenant-specific additive overrides.
 * @description
 *   Logs generic request information to the console and attempts to resolve
 *   and execute tenant-specific logging middleware from /src/middleware/<tenant>/.
 *   Delegates visit logging to tenant-specific handlers without imposing global filters.
 * @query {}
 * @requestExample none
 * @response none
 * @requires {
 *   "dependencies": ["express", "@middleware/tenantResolver"]
 * }
 */
import type { Request, Response, NextFunction } from 'express';
import { executeTenantSpecific } from '@middleware/tenantResolver';
import { dbStorage, baseDb } from '@services/dbService';

export function loggingMiddleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
        logger.log(`[DEBUG] [GENERIC] loggingMiddleware triggered for ${req.path}`);
        const tenant = (req as any).tenant;

        res.once('finish', async () => {
            const loggingWork = (async () => {
                const scopedDb = (res.locals as any).db || baseDb;
                await dbStorage.run(scopedDb as any, async () => {
                    logger.log(`[DEBUG] [GENERIC] finish event for ${req.path}, visitLogged: ${res.locals.visitLogged}`);
                    if (res.locals.visitLogged) return;

                    const userId = res.locals.visitUserId || (req as any).auth?.userId || null;
                    logger.log(`[Generic Logging] ${req.method} ${req.path} for tenant: ${tenant}, userId: ${userId} - Status: ${res.statusCode}`);

                    // 2. Execute tenant-specific additive middleware
                    logger.log(`[DEBUG] [GENERIC] About to call executeTenantSpecific for tenant: ${tenant}, path: ${req.path}`);
                    await executeTenantSpecific(tenant, 'loggingMiddleware', req, res, () => {});
                });
            })();
            
            // Resolve the deferred promise so tenantTransaction knows we are done
            if ((res.locals as any).resolveLogging) {
                (res.locals as any).resolveLogging();
            }
            
            await loggingWork;
        });

        // Create a deferred promise for tenantTransaction to wait on
        let resolveLogging!: () => void;
        const loggingPromise = new Promise<void>((resolve) => {
            resolveLogging = resolve;
        });
        (res.locals as any).loggingPromise = loggingPromise;
        (res.locals as any).resolveLogging = resolveLogging;

        next();
    };
}
