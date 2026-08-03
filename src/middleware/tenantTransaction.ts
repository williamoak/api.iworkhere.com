import type { Request, Response, NextFunction } from 'express';
import { db, dbStorage } from '@services/dbService';
import { sql } from 'drizzle-orm';

export function tenantTransaction() {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const tenant = (req as any).tenant || 'public';
    console.log(`[DEBUG] tenantTransaction: tenant=${tenant}`);
    
    try {
      await db.transaction(async (tx) => {
        // Set local search path for this transaction
        await tx.execute(sql`SET LOCAL search_path TO ${sql.raw(tenant)}, public`);
        
        // Wrap the rest of the request in the storage context
        await dbStorage.run(tx as any, () => {
            next();
        });
      });
    } catch (err) {
      next(err);
    }
  };
}
