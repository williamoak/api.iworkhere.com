/**
 * @myDocBlock
 * @file POST.ts
 * @external
 * @module monitor-visit
 * @tag monitor, visit
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path /v1/monitor/visit
 * @summary Explicit visit reporting endpoint.
 *
 * @description
 *   Allows clients (like the mobile app) to explicitly report page views
 *   or other significant user interactions that do not naturally trigger
 *   a backend request.
 *
 *   The request is captured by the global logging middleware and recorded
 *   in the visit_info table.
 *
 * @body
 *   {
 *     "device_id": "string",
 *     "user_id": "string",
 *     "request_method": "string",
 *     "note": "string"
 *   }
 *
 * @requestExample
 *   { "method": "POST", "url": "/v1/monitor/visit", "body": { "device_id": "optional-uuid", "user_id": "optional-uuid", "request_method": "GET", "note": "visit: About Page" } }
 *
 * @response
 *   { "ok": true }
 *
 * @requires none
 */

import { Request, Response } from "express";
import { db } from "@services/dbService";
import crypto from "crypto";
import { visitInfo } from "@db/schema/visit_info";
import { logger } from "@helpers/logger";

/**
 * Deterministically formats a hex string into a UUIDv7-style string.
 */
function formatToUUID7(hex: string): string {
    const s = hex.toLowerCase();
    return `${s.slice(0, 8)}-${s.slice(8, 12)}-7${s.slice(13, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

export default async function handler(
    req: Request,
    res: Response
): Promise<{ ok: true } | void | Response> {
    const { device_id, user_id, request_method, note } = req.body;
    
    if (device_id) {
        res.locals.visitDeviceId = device_id;
    }

    if (user_id) {
        res.locals.visitUserId = user_id;
    }

    if (request_method) {
        res.locals.visitRequestMethod = request_method;
    }

    if (note) {
        res.locals.visitNote = note;
    }

    try {
        // Calculate user and device IDs with fallbacks, matching logging middleware logic
        let finalUserId = user_id || (req as any).auth?.userId || null;
        if (!finalUserId) {
            const guestHash = crypto.createHash('sha256').update("guest").digest('hex');
            finalUserId = formatToUUID7(guestHash);
        }

        let finalDeviceId = device_id || req.headers['x-device-id'] as string;
        if (!finalDeviceId) {
            const ip = (req.headers['x-forwarded-for'] as string) || req.ip || 'unknown';
            const ua = req.headers['user-agent'] || 'unknown';
            const hash = crypto.createHash('sha256').update(`${ip}-${ua}`).digest('hex');
            finalDeviceId = formatToUUID7(hash);
        }

        const finalNote = note || `visit: ${req.path}`;
        const finalMethod = request_method || req.method || 'GET';

        // Using ORM for insertion. The tenant schema is handled by the search_path 
        // set in the tenantTransaction middleware.
        await db.insert(visitInfo).values({
            deviceId: finalDeviceId,
            userId: finalUserId,
            requestMethod: finalMethod,
            touchTime: new Date(),
            note: finalNote
        });
        
        res.locals.visitLogged = true;
    } catch (e) {
        // We don't fail the request if logging fails, but we should log the error
        logger.error(`[Visit Endpoint] Failed to record visit for tenant ${(req as any).tenant}:`, e);
    }

    return res.json({ ok: true });
}
