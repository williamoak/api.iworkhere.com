import { logger } from '@helpers/logger';

/**
 * @myDocBlock
 * @file loggingMiddleware.ts
 * @internal
 * @module Middleware
 * @tag api, logging, joinaunion
 * @version 1.0.1
 * @author william.r.oak@gmail.com
 * @path src/middleware/joinaunion/loggingMiddleware.ts
 * @summary Tenant-specific visit logging middleware for joinaunion.
 * @description
 *   Audit logging implementation specific to the joinaunion tenant.
 *   Checks for enabled logging in the database configuration and records
 *   visit details including user information and device fingerprinting.
 * @requestExample none
 * @response none
 * @requires {
 *   "dependencies": ["express", "drizzle-orm", "@services/dbService", "@db/schema/*"]
 * }
 */
import type { Request, Response, NextFunction } from 'express';
import { db } from '@services/dbService';
import crypto from 'crypto';
import { sql } from 'drizzle-orm';

/**
 * Formats a hex string into a UUIDv7-style deterministic string.
 * UUIDv7 structure: [48 bits timestamp][4 bits version (7)][62 bits random/data]
 * We simulate this by placing '7' in the version position of our hash.
 */
function formatToUUID7(hex: string): string {
    const s = hex.toLowerCase();
    return `${s.slice(0, 8)}-${s.slice(8, 12)}-7${s.slice(13, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

export default async function loggingMiddleware(req: Request, res: Response, next: NextFunction) {
    console.log('[DEBUG] loggingMiddleware hit');
    // Perform logging after response finishes to capture final context
    res.once('finish', async () => {
        console.log('[DEBUG] loggingMiddleware finish hit');
        try {
            let userId = (req as any).auth?.userId || res.locals.visitUserId || null;

            // If user is not known, calculate deterministic UUID7 for "guest"
            if (!userId) {
                const guestHash = crypto.createHash('sha256').update("guest").digest('hex');
                userId = formatToUUID7(guestHash);
            }

            logger.log(`[DEBUG] [JOINAUNION] Captured userId in finish event: ${userId}, req.auth: ${(req as any).auth?.userId}, res.locals.visitUserId: ${res.locals.visitUserId}`);
            let deviceId = res.locals.visitDeviceId || req.headers['x-device-id'] as string;

            if (!deviceId) {
                const ip = (req.headers['x-forwarded-for'] as string) || req.ip || 'unknown';
                const ua = req.headers['user-agent'] || 'unknown';
                const hash = crypto.createHash('sha256').update(`${ip}-${ua}`).digest('hex');
                deviceId = formatToUUID7(hash);
            }

            const note = (res.locals.visitNote as string) || `visit: ${req.path}`;
            const method = res.locals.visitRequestMethod || req.method || 'GET';

            await db.execute(sql`INSERT INTO joinaunion.visit_info (id, device_id, user_id, request_method, touch_time, note) VALUES (gen_random_uuid(), ${deviceId}, ${userId}, ${method}, ${new Date().toISOString()}, ${note})`);
        } catch (e) {
            logger.error("[DEBUG] [JOINAUNION] Failed to process request logging for joinaunion:", e);
        }
    });

    next();
}
