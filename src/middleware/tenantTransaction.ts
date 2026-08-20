/**
 * @myDocBlock
 * @file tenantTransaction.ts
 * @internal
 * @module Middleware
 * @tag api, multi-tenant
 * @version 1.0.1
 * @author william.r.oak@gmail.com
 * @path src/middleware/tenantTransaction.ts
 * @summary Scopes database interactions to a specific tenant using transactions and search_path.
 * @description
 *   Wraps the request pipeline in a database transaction, sets the session's
 *   `search_path` to the tenant-specific schema, and binds this context
 *   to the AsyncLocalStorage for all database calls.
 * @query {}
 * @requestExample none
 * @response none
 * @requires {
 *   "dependencies": ["drizzle-orm", "@services/dbService"]
 * }
 */
import type { Request, Response, NextFunction } from 'express';
import { dbStorage, pool, schema } from '@services/dbService';
import { drizzle } from 'drizzle-orm/node-postgres';

export function tenantTransaction() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const tenant = (req as any).tenant || 'public';
    
    // Scoping database interactions to a specific tenant using search_path.
    // We acquire a dedicated client from the pool for the duration of the request.
    try {
        const client = await pool.connect();
        
        let released = false;
        const release = async () => {
            if (released) return;
            released = true;
            
            // Wait for logging to finish if it's running
            console.log(`[DEBUG] [TENANT_TRANSACTION] Waiting for loggingPromise: ${!!(res.locals as any).loggingPromise}`);
            if ((res.locals as any).loggingPromise) {
                await (res.locals as any).loggingPromise;
            }
            
            try {
                console.log(`[DEBUG] [TENANT_TRANSACTION] Resetting search_path`);
                await client.query('RESET search_path');
            } catch (e) {
                // Ignore errors during reset
            }
            client.release();
        };

        // Ensure client is returned to pool when request finishes
        res.once('finish', release);
        res.once('close', release);

        // Set the search_path for this client
        console.log(`[DEBUG] [TENANT_TRANSACTION] Setting search_path to ${tenant}, public for tenant ${tenant}`);
        await client.query(`SET search_path TO ${tenant}, public`);
        
        // Verify search_path
        const check = await client.query('SHOW search_path');
        console.log(`[DEBUG] [TENANT_TRANSACTION] search_path set to: ${JSON.stringify(check.rows)}`);
        
        // Create a scoped Drizzle instance wrapping this client
        const scopedDb = drizzle(client, { schema: schema as any });
        
        // Store in locals for downstream use
        (res.locals as any).db = scopedDb;

        // Bind the scoped instance to AsyncLocalStorage
        await dbStorage.run(scopedDb as any, async () => {
            next();
        });
    } catch (e) {
        next(e);
    }
  };
}
