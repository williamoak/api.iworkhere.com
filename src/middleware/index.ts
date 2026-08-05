/**
 * @myDocBlock
 * @file index.ts
 * @internal
 * @module Middleware
 * @tag api
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path src/middleware/index.ts
 * @summary Entry point for global middleware registration.
 * @description
 *   Centralizes the sequential registration of all global middleware required
 *   for the application lifecycle.
 * @requestExample none
 * @response none
 * @requires {
 *   "dependencies": ["express", "@middleware/*"]
 * }
 */
import { Application } from 'express';
import { tenantMiddleware } from "@middleware/tenantMiddleware";
import { tenantTransaction } from "@middleware/tenantTransaction";
import { loggingMiddleware } from "@middleware/loggingMiddleware";
import { webAuthMiddleware } from "@middleware/webAuthMiddleware";

export function applyGlobalMiddleware(app: Application) {
    // 1. Tenant Resolution
    app.use(tenantMiddleware());
    
    // 2. Database Transaction/Context
    app.use(tenantTransaction());
    
    // 3. Authentication
    app.use(webAuthMiddleware);
    
    // 4. Audit/Request Logging
    app.use(loggingMiddleware());
}
