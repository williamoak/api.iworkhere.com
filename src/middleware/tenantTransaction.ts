/**
 * @myDocBlock
 * @file tenantTransaction.ts
 * @internal
 * @module Middleware
 * @tag api, multi-tenant
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path src/middleware/tenantTransaction.ts
 * @summary Scopes database interactions to a specific tenant using transactions and search_path.
 * @description
 *   Wraps the request pipeline in a database transaction, sets the session's
 *   `search_path` to the tenant-specific schema, and binds this context
 *   to the AsyncLocalStorage for all database calls.
 * @requestExample none
 * @response none
 * @requires {
 *   "dependencies": ["drizzle-orm", "@services/dbService"]
 * }
 */
import type { Request, Response, NextFunction } from 'express';
import { dbStorage, baseDb } from '@services/dbService';
import { sql } from 'drizzle-orm';

export function tenantTransaction() {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const tenant = (req as any).tenant || 'public';
    
    // Run the entire request pipeline within the database context
    await dbStorage.run(baseDb as any, async () => {
        // We use a transaction to scope the search_path
        await baseDb.transaction(async (tx) => {
            // noinspection SqlDialectInspection
            const query = sql`SET LOCAL search_path TO ${sql.raw(tenant)}, public`;
            await tx.execute(query);
            
            // Re-bind the context to this transaction specifically
            await dbStorage.run(tx as any, async () => {
                next();
            });
        });
    });
  };
}
