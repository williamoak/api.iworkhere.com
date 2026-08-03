import type { Request, Response, NextFunction } from 'express';
import { db } from '@services/dbService';
import { visitInfo } from '@db/schema/visit_info';
import crypto from 'crypto';

function formatToUUID(hex: string): string {
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function getDefaultNote(path: string, method: string): string {
    return path.includes('/login') ? 'login' :
           path.includes('/logout') ? 'logout' :
           path.includes('/create') ? 'create record' :
           path.includes('/delete') ? 'delete record' :
           `visit: ${path}`;
}

export function visitLoggerMiddleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
        const tenant = (req as any).tenant;
        const userId = (req as any).auth?.userId || null;
        
        console.log(`[DEBUG] visitLogger: processing request. Host: ${req.hostname}, Tenant: ${tenant}`);
        
        // Only log for joinaunion
        if (tenant === 'joinaunion') {
            let deviceId = req.headers['x-device-id'] as string;
            
            // Fallback: Generate fingerprint if x-device-id is missing
            if (!deviceId) {
                const ip = (req.headers['x-forwarded-for'] as string) || req.ip || 'unknown';
                const ua = req.headers['user-agent'] || 'unknown';
                const hash = crypto.createHash('sha256').update(`${ip}-${ua}`).digest('hex');
                deviceId = formatToUUID(hash);
            }
            
            try {
                // Priority for note: 
                // 1. Explicitly set by route handler (res.locals.visitNote)
                // 2. Default based on path + method
                const note = (res.locals.visitNote as string) || 
                             getDefaultNote(req.path, req.method);

                await db.insert(visitInfo).values({
                    deviceId: deviceId,
                    userId: userId,
                    requestMethod: req.method,
                    touchTime: new Date(),
                    note: note
                });
            } catch (e) {
                console.error("Failed to log visit:", e);
            }
        }
        
        next();
    };
}
