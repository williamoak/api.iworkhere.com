import type { Request, Response, NextFunction } from 'express';
import { db, dbStorage, baseDb } from '@services/dbService';
import { sql } from 'drizzle-orm';

export function tenantTransaction() {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const tenant = (req as any).tenant || 'public';
    
    // Set search path for this request's database interactions
    await db.execute(sql`SET search_path TO ${sql.raw(tenant)}, public`);
    
    // Run the request in the context of the baseDb instance, not the proxy
    await dbStorage.run(baseDb as any, () => {
        next();
    });
  };
}
