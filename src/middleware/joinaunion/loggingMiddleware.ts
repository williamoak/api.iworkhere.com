/**
 * @myDocBlock
 * @file loggingMiddleware.ts
 * @internal
 * @module Middleware
 * @tag api, logging, joinaunion
 * @version 1.0.3
 * @author william.r.oak@gmail.com
 * @path src/middleware/joinaunion/loggingMiddleware.ts
 * @summary Tenant-specific visit logging middleware for joinaunion.
 * @description
 *   Audit logging implementation specific to the joinaunion tenant.
 *   Determines whether incoming API requests should be recorded to the
 *   visit_info database table and executes the insertion, while bypassing
 *   internal infrastructure and telemetry requests such as localization,
 *   health checks, and monitor pings.
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
 * Checks whether an incoming request is for internal infrastructure, health telemetry,
 * or localization endpoints that should not be recorded into the visit_info audit table.
 */
function isExemptFromVisitLogging(req: Request): boolean {
    const p = req.path || '';
    const orig = req.originalUrl || '';
    const base = req.baseUrl || '';

    return (
        p.startsWith('/v1/localization') ||
        p.startsWith('/localization') ||
        orig.startsWith('/v1/localization') ||
        orig.startsWith('/localization') ||
        base.startsWith('/v1/localization') ||
        base.startsWith('/localization') ||
        p.startsWith('/v1/health') ||
        p.startsWith('/health') ||
        orig.startsWith('/v1/health') ||
        orig.startsWith('/health') ||
        p.startsWith('/v1/monitor') ||
        p.startsWith('/monitor') ||
        orig.startsWith('/v1/monitor') ||
        orig.startsWith('/monitor') ||
        p === '/ping' ||
        orig === '/ping' ||
        p === '/favicon.ico' ||
        orig === '/favicon.ico'
    );
}

/**
 * Formats a hex string into a UUIDv7-style deterministic string.
 * UUIDv7 structure: [48 bits timestamp][4 bits version (7)][62 bits random/data]
 * We simulate this by placing '7' in the version position of our hash.
 */
function formatToUUID7(hex: string): string {
    const s = hex.toLowerCase();
    return `${s.slice(0, 8)}-${s.slice(8, 12)}-7${s.slice(13, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

/**
 * Safely parses a coordinate (latitude/longitude) value to a finite number or null.
 */
function parseCoordinate(val: any): number | null {
    if (val === undefined || val === null || val === '') return null;
    const num = typeof val === 'number' ? val : parseFloat(String(val));
    return Number.isFinite(num) ? num : null;
}

/**
 * Safely parses location source value to a sanitized string (max 32 chars) or null.
 */
function parseLocationSource(val: any): string | null {
    if (val === undefined || val === null || val === '') return null;
    const str = String(val).trim();
    return str.length > 0 ? str.slice(0, 32) : null;
}

/**
 * Safely parses city value to a sanitized string (max 128 chars) or null.
 */
function parseCity(val: any): string | null {
    if (val === undefined || val === null || val === '') return null;
    const str = String(val).trim();
    return str.length > 0 ? str.slice(0, 128) : null;
}

export default async function loggingMiddleware(req: Request, res: Response, next: NextFunction) {
    logger.log(`[DEBUG] [JOINAUNION] loggingMiddleware ENTRY for ${req.path}`);

    if (isExemptFromVisitLogging(req)) {
        res.locals.visitLogged = true;
        logger.log(`[DEBUG] [JOINAUNION] Exempt endpoint detected (${req.path}), bypassing visit_info DB logging.`);
        next();
        return;
    }

    const doLogging = async () => {
        logger.log(`[DEBUG] [JOINAUNION] Starting doLogging for ${req.path}`);
        if (res.locals.visitLogged || isExemptFromVisitLogging(req)) {
            logger.log(`[DEBUG] [JOINAUNION] Already logged or exempt endpoint (${req.path}), skipping.`);
            res.locals.visitLogged = true;
            return;
        }
        
        try {
            logger.log(`[DEBUG] [JOINAUNION] Attempting DB insert for ${req.path}`);
            
            // Use the scoped DB from res.locals.db which was set by tenantTransaction, or fallback to the proxy
            const dbInstance = (res.locals as any).db || db;
            const tenant = (req as any).tenant || 'joinaunion';
            
            // Explicit instrumentation of insert details
            try {
                await dbInstance.execute(sql`SET search_path TO ${tenant}, public`);
                const schemaRes = await dbInstance.execute(sql`SELECT current_schema()`);
                const pathRes = await dbInstance.execute(sql`SHOW search_path`);
                const userRes = await dbInstance.execute(sql`SELECT current_user`);
                
                logger.log(`[DEBUG] [JOINAUNION] INSERT_DIAGNOSTICS for ${req.path}:`);
                logger.log(`  Table: visit_info`);
                logger.log(`  Schema: ${JSON.stringify(schemaRes.rows)}`);
                logger.log(`  Search Path: ${JSON.stringify(pathRes.rows)}`);
                logger.log(`  User: ${JSON.stringify(userRes.rows)}`);
                logger.log(`  Database Instance Source: ${ (res.locals as any).db ? 'res.locals.db (scoped)' : 'db proxy (global)' }`);
            } catch (e) {
                logger.error(`[DEBUG] [JOINAUNION] Error gathering INSERT_DIAGNOSTICS:`, e);
            }
            
            // Anonymous requests remain unattributed; only verified auth context may set userId.
            const userId = (req as any).auth?.userId || null;

            let deviceId = res.locals.visitDeviceId || req.headers['x-device-id'] as string;

            if (!deviceId) {
                const ip = (req.headers['x-forwarded-for'] as string) || req.ip || 'unknown';
                const ua = req.headers['user-agent'] || 'unknown';
                const hash = crypto.createHash('sha256').update(`${ip}-${ua}`).digest('hex');
                deviceId = formatToUUID7(hash);
            }

            const note = (res.locals.visitNote as string) || `visit: ${req.path}`;
            const method = res.locals.visitRequestMethod || req.method || 'GET';

            const latitude = parseCoordinate(
                res.locals.visitLatitude ??
                req.headers['x-latitude'] ??
                req.headers['x-lat'] ??
                (req.body as any)?.latitude ??
                (req.body as any)?.lat ??
                req.query?.latitude ??
                req.query?.lat
            );

            const longitude = parseCoordinate(
                res.locals.visitLongitude ??
                req.headers['x-longitude'] ??
                req.headers['x-long'] ??
                req.headers['x-lng'] ??
                (req.body as any)?.longitude ??
                (req.body as any)?.long ??
                (req.body as any)?.lng ??
                req.query?.longitude ??
                req.query?.long ??
                req.query?.lng
            );

            const locationSource = parseLocationSource(
                res.locals.visitLocationSource ??
                req.headers['x-location-source'] ??
                req.headers['x-loc-source'] ??
                (req.body as any)?.location_source ??
                (req.body as any)?.locationSource ??
                req.query?.location_source ??
                req.query?.locationSource
            );

            const city = parseCity(
                res.locals.visitCity ??
                req.headers['x-city'] ??
                req.headers['x-client-city'] ??
                (req.body as any)?.city ??
                req.query?.city
            );

            const requestLogPayload = {
                method: req.method,
                url: req.originalUrl || req.path,
                headers: req.headers,
                body: req.body,
                query: req.query,
                resLocals: {
                    visitLocationSource: res.locals.visitLocationSource,
                    visitCity: res.locals.visitCity,
                    visitLatitude: res.locals.visitLatitude,
                    visitLongitude: res.locals.visitLongitude,
                    visitNote: res.locals.visitNote,
                    visitDeviceId: res.locals.visitDeviceId,
                    visitUserId: res.locals.visitUserId,
                }
            };
            logger.log(`[LoggingMiddleware] [JOINAUNION] Request JSON for ${req.method} ${req.originalUrl || req.path}:\n` + JSON.stringify(requestLogPayload, null, 2));
            logger.log(`[DEBUG] [JOINAUNION] Request shape for ${req.method} ${req.originalUrl || req.path}:`, JSON.stringify(requestLogPayload));

            logger.log(`[DEBUG] [JOINAUNION] Preparing insert data for ${req.path}: deviceId=${deviceId}, userId=${userId}, method=${method}, latitude=${latitude}, longitude=${longitude}, locationSource=${locationSource}, city=${city}, note=${note}`);
            const values = {
                deviceId: deviceId as string,
                userId: userId,
                requestMethod: method as string,
                touchTime: new Date(),
                latitude: latitude,
                longitude: longitude,
                locationSource: locationSource,
                city: city,
                note: note as string
            };
            logger.log(`[DEBUG] [JOINAUNION] Values:`, JSON.stringify(values));

            await dbInstance.insert(visitInfo).values(values);
            logger.log(`[DEBUG] [JOINAUNION] Successfully inserted visit for ${req.path}`);
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
