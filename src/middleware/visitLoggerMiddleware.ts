import type { Request, Response, NextFunction } from 'express';
import { db } from '@services/dbService';
import { visitInfo } from '@db/schema/visit_info';

export function visitLoggerMiddleware() {
    return async (req: Request, _res: Response, next: NextFunction) => {
        const tenant = (req as any).tenant;
        
        console.log(`[DEBUG] visitLogger: processing request. Host: ${req.hostname}, Tenant: ${tenant}`);
        
        // Only log for joinaunion
        if (tenant === 'joinaunion') {
            const deviceId = req.headers['x-device-id'] as string;
            console.log(`[DEBUG] visitLogger: deviceId: ${deviceId}`);
            
            if (deviceId) {
                try {
                    await db.insert(visitInfo).values({
                        deviceId: deviceId,
                        touchTime: new Date(),
                        note: req.query.note as string || req.body?.note as string || null
                    });
                } catch (e) {
                    console.error("Failed to log visit:", e);
                }
            } else {
                console.log(`[DEBUG] visitLogger: tenant is joinaunion but no x-device-id found.`);
            }
        }
        
        next();
    };
}
