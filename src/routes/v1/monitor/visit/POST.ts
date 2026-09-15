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
 *     "page_name": "string",
 *     "request_method": "string",
 *     "latitude": "number",
 *     "longitude": "number",
 *     "location_source": "string",
 *     "note": "string"
 *   }
 *
 * @requestExample
 *   { "method": "POST", "url": "/v1/monitor/visit", "body": { "user_id": "optional-uuid", "device_id": "optional-uuid", "page_name": "home", "request_method": "GET", "latitude": 41.8781, "longitude": -87.6298, "location_source": "ip_centroid" } }
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
    const requestJson = {
        method: req.method,
        url: req.originalUrl || req.path,
        headers: req.headers,
        body: req.body,
        query: req.query
    };
    logger.log('[Visit Endpoint] Request JSON:\n' + JSON.stringify(requestJson, null, 2));
    logger.log(`[Visit Endpoint] Incoming request shape for ${req.method} ${req.originalUrl || req.path}:`, JSON.stringify(requestJson));

    const { device_id, user_id, request_method, page_name, note, latitude, longitude, location_source, city } = req.body || {};
    
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
    } else if (page_name) {
        res.locals.visitNote = `visit: ${page_name}`;
    }

    if (latitude !== undefined) {
        res.locals.visitLatitude = latitude;
    }

    if (longitude !== undefined) {
        res.locals.visitLongitude = longitude;
    }

    if (location_source !== undefined) {
        res.locals.visitLocationSource = location_source;
    }

    if (city !== undefined) {
        res.locals.visitCity = city;
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

        const finalNote = note || (page_name ? `visit: ${page_name}` : `visit: ${req.path}`);
        const finalMethod = request_method || req.method || 'GET';

        const parseCoord = (val: any) => {
            if (val === undefined || val === null || val === '') return null;
            const num = typeof val === 'number' ? val : parseFloat(String(val));
            return Number.isFinite(num) ? num : null;
        };

        const parseSource = (val: any): string | null => {
            if (val === undefined || val === null || val === '') return null;
            const str = String(val).trim();
            return str.length > 0 ? str.slice(0, 32) : null;
        };

        const parseCityVal = (val: any): string | null => {
            if (val === undefined || val === null || val === '') return null;
            const str = String(val).trim();
            return str.length > 0 ? str.slice(0, 128) : null;
        };

        const finalLat = parseCoord(latitude ?? req.headers['x-latitude'] ?? req.headers['x-lat']);
        const finalLng = parseCoord(longitude ?? req.headers['x-longitude'] ?? req.headers['x-long'] ?? req.headers['x-lng']);
        const finalLocationSource = parseSource(location_source ?? req.headers['x-location-source']);
        const finalCity = parseCityVal(city ?? req.headers['x-city'] ?? req.headers['x-client-city']);

        // Using ORM for insertion. The tenant schema is handled by the search_path 
        // set in the tenantTransaction middleware.
        await db.insert(visitInfo).values({
            deviceId: finalDeviceId,
            userId: finalUserId,
            requestMethod: finalMethod,
            touchTime: new Date(),
            latitude: finalLat,
            longitude: finalLng,
            locationSource: finalLocationSource,
            city: finalCity,
            note: finalNote
        });
        
        res.locals.visitLogged = true;
    } catch (e) {
        // We don't fail the request if logging fails, but we should log the error
        logger.error(`[Visit Endpoint] Failed to record visit for tenant ${(req as any).tenant}:`, e);
    }

    const responseJson = { ok: true as const };
    logger.log('[Visit Endpoint] Response JSON:\n' + JSON.stringify(responseJson, null, 2));
    return res.json(responseJson);
}
