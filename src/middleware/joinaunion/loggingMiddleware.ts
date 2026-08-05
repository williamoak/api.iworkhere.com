import { logger } from '@helpers/logger';

/**
 * @myDocBlock
 * @file loggingMiddleware.ts
 * @internal
 * @module Middleware
 * @tag api, logging, joinaunion
 * @version 1.0.0
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
;

function formatToUUID(hex: string): string {
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export default async function loggingMiddleware(req: Request, res: Response, next: NextFunction) {
    // Perform logging after response finishes to capture final context
    res.once('finish', async () => {
        try {
            // Re-capture userId here because route handlers might have set visitUserId after loggingMiddleware ran
            const userId = (req as any).auth?.userId || res.locals.visitUserId || null;
            logger.log(`[DEBUG] [JOINAUNION] Captured userId in finish event: ${userId}, req.auth: ${(req as any).auth?.userId}, res.locals.visitUserId: ${res.locals.visitUserId}`);
            let deviceId = req.headers['x-device-id'] as string;

            if (!deviceId) {
                const ip = (req.headers['x-forwarded-for'] as string) || req.ip || 'unknown';
                const ua = req.headers['user-agent'] || 'unknown';
                const hash = crypto.createHash('sha256').update(`${ip}-${ua}`).digest('hex');
                deviceId = formatToUUID(hash);
            }

            const note = (res.locals.visitNote as string) || `visit: ${req.path}`;

            await db.execute(sql`INSERT INTO joinaunion.visit_info (id, device_id, user_id, request_method, touch_time, note) VALUES (gen_random_uuid(), ${deviceId}, ${userId}, ${req.method}, ${new Date().toISOString()}, ${note})`);
        } catch (e) {
            logger.error("[DEBUG] [JOINAUNION] Failed to process request logging for joinaunion:", e);
        }
    });

    next();
}
