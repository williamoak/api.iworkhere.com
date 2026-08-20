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
import { logger } from '@helpers/logger';
import type { Request, Response, NextFunction } from 'express';
import { db } from '@services/dbService';
import { visitInfo } from '@db/schema/visit_info';
import { sql } from 'drizzle-orm';
import crypto from 'crypto';

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
    logger.warn(`[DEBUG] [JOINAUNION] loggingMiddleware ENTRY for ${req.path}`);
    const doLogging = async () => {
        logger.warn(`[DEBUG] [JOINAUNION] Starting doLogging for ${req.path}`);
        if (res.locals.visitLogged) {
            logger.log(`[DEBUG] [JOINAUNION] Already logged, skipping.`);
            return;
        }
        
        try {
            logger.warn(`[DEBUG] [JOINAUNION] Attempting DB insert for ${req.path}`);
            
            // Use the scoped DB from res.locals.db which was set by tenantTransaction, or fallback to the proxy
            const dbInstance = (res.locals as any).db || db;
            const tenant = (req as any).tenant || 'joinaunion';
            
            // Explicit instrumentation of insert details
            try {
                await dbInstance.execute(sql`SET search_path TO ${tenant}, public`);
                const schemaRes = await dbInstance.execute(sql`SELECT current_schema()`);
                const pathRes = await dbInstance.execute(sql`SHOW search_path`);
                const userRes = await dbInstance.execute(sql`SELECT current_user`);
                
                logger.warn(`[DEBUG] [JOINAUNION] INSERT_DIAGNOSTICS for ${req.path}:`);
                logger.warn(`  Table: visit_info`);
                logger.warn(`  Schema: ${JSON.stringify(schemaRes.rows)}`);
                logger.warn(`  Search Path: ${JSON.stringify(pathRes.rows)}`);
                logger.warn(`  User: ${JSON.stringify(userRes.rows)}`);
                logger.warn(`  Database Instance Source: ${ (res.locals as any).db ? 'res.locals.db (scoped)' : 'db proxy (global)' }`);
            } catch (e) {
                logger.error(`[DEBUG] [JOINAUNION] Error gathering INSERT_DIAGNOSTICS:`, e);
            }
            
            let userId = (req as any).auth?.userId || res.locals.visitUserId || null;

            // If user is not known, calculate deterministic UUID7 for "guest"
            if (!userId) {
                const guestHash = crypto.createHash('sha256').update("guest").digest('hex');
                userId = formatToUUID7(guestHash);
            }

            let deviceId = res.locals.visitDeviceId || req.headers['x-device-id'] as string;

            if (!deviceId) {
                const ip = (req.headers['x-forwarded-for'] as string) || req.ip || 'unknown';
                const ua = req.headers['user-agent'] || 'unknown';
                const hash = crypto.createHash('sha256').update(`${ip}-${ua}`).digest('hex');
                deviceId = formatToUUID7(hash);
            }

            const note = (res.locals.visitNote as string) || `visit: ${req.path}`;
            const method = res.locals.visitRequestMethod || req.method || 'GET';

            logger.warn(`[DEBUG] [JOINAUNION] Preparing insert data for ${req.path}: deviceId=${deviceId}, userId=${userId}, method=${method}, note=${note}`);
            const values = {
                deviceId: deviceId as string,
                userId: userId,
                requestMethod: method as string,
                touchTime: new Date(),
                note: note as string
            };
            logger.warn(`[DEBUG] [JOINAUNION] Values:`, JSON.stringify(values));

            await dbInstance.insert(visitInfo).values(values);
            logger.warn(`[DEBUG] [JOINAUNION] Successfully inserted visit for ${req.path}`);
            res.locals.visitLogged = true;
        } catch (e) {
            logger.error("[DEBUG] [JOINAUNION] Failed to process request logging for joinaunion:", e);
        }
    };

    // If the response is already finished (e.g. called from another 'finish' listener),
    // execute immediately. Otherwise, wait for 'finish'.
    if (res.writableEnded || (res as any).finished) {
        doLogging();
    } else {
        res.once('finish', doLogging);
    }

    next();
}
