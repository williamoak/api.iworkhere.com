/**
 * @myDocBlock
 * @file POST.ts
 * @external
 * @module monitor-visit
 * @tag monitor, visit
 * @version 1.1.0
 * @author william.r.oak@gmail.com
 * @path /v1/monitor/visit
 * @summary Explicit visit reporting endpoint.
 *
 * @description
 *   Allows clients (like the mobile app) to explicitly report page views
 *   or other significant user interactions that do not naturally trigger
 *   a backend request.
 *
 *   The request is captured and recorded in the visit_info table with full
 *   geographic metadata (city, country, region, coordinates, location source).
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
 *     "city": "string",
 *     "country": "string",
 *     "region": "string",
 *     "note": "string"
 *   }
 *
 * @requestExample
 *   { "method": "POST", "url": "/v1/monitor/visit", "body": { "user_id": "optional-uuid", "device_id": "optional-uuid", "page_name": "Home", "request_method": "GET", "latitude": 49.2827, "longitude": -123.1207, "location_source": "ip_centroid", "city": "Vancouver", "country": "CA", "region": "British Columbia" } }
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

    const {
        device_id,
        deviceId: altDeviceId,
        user_id,
        userId: altUserId,
        request_method,
        requestMethod: altRequestMethod,
        page_name,
        pageName: altPageName,
        note,
        latitude,
        lat,
        longitude,
        long,
        lng,
        location_source,
        locationSource: altLocationSource,
        city,
        country,
        region,
    } = req.body || {};

    const rawDeviceId = device_id ?? altDeviceId;
    const rawUserId = user_id ?? altUserId;
    const rawRequestMethod = request_method ?? altRequestMethod;
    const rawPageName = page_name ?? altPageName;
    const rawNote = note;
    const rawLatitude = latitude ?? lat;
    const rawLongitude = longitude ?? long ?? lng;
    const rawLocationSource = location_source ?? altLocationSource;
    const rawCity = city;
    const rawCountry = country;
    const rawRegion = region;
    
    if (rawDeviceId) {
        res.locals.visitDeviceId = rawDeviceId;
    }

    if (rawUserId) {
        res.locals.visitUserId = rawUserId;
    }

    if (rawRequestMethod) {
        res.locals.visitRequestMethod = rawRequestMethod;
    }

    if (rawNote) {
        res.locals.visitNote = rawNote;
    } else if (rawPageName) {
        res.locals.visitNote = `visit: ${rawPageName}`;
    }

    if (rawLatitude !== undefined) {
        res.locals.visitLatitude = rawLatitude;
    }

    if (rawLongitude !== undefined) {
        res.locals.visitLongitude = rawLongitude;
    }

    if (rawLocationSource !== undefined) {
        res.locals.visitLocationSource = rawLocationSource;
    }

    if (rawCity !== undefined) {
        res.locals.visitCity = rawCity;
    }

    if (rawCountry !== undefined) {
        res.locals.visitCountry = rawCountry;
    }

    if (rawRegion !== undefined) {
        res.locals.visitRegion = rawRegion;
    }

    try {
        // Calculate user and device IDs with fallbacks, matching logging middleware logic
        let finalUserId = rawUserId || (req as any).auth?.userId || null;
        if (!finalUserId) {
            const guestHash = crypto.createHash('sha256').update("guest").digest('hex');
            finalUserId = formatToUUID7(guestHash);
        }

        let finalDeviceId = rawDeviceId || (req.headers['x-device-id'] as string) || (req.headers['x-client-device-id'] as string);
        if (!finalDeviceId) {
            const ip = (req.headers['x-forwarded-for'] as string) || req.ip || 'unknown';
            const ua = req.headers['user-agent'] || 'unknown';
            const hash = crypto.createHash('sha256').update(`${ip}-${ua}`).digest('hex');
            finalDeviceId = formatToUUID7(hash);
        }

        const finalNote = rawNote || (rawPageName ? `visit: ${rawPageName}` : `visit: ${req.path}`);
        const finalMethod = rawRequestMethod || req.method || 'GET';

        const parseCoord = (val: any): number | null => {
            if (val === undefined || val === null || val === '') return null;
            const num = typeof val === 'number' ? val : parseFloat(String(val));
            return Number.isFinite(num) ? num : null;
        };

        const parseSource = (val: any): string | null => {
            if (val === undefined || val === null || val === '') return null;
            const str = String(val).trim();
            return str.length > 0 ? str.slice(0, 32) : null;
        };

        const parseStringVal = (val: any, maxLen: number = 128): string | null => {
            if (val === undefined || val === null || val === '') return null;
            const str = String(val).trim();
            return str.length > 0 ? str.slice(0, maxLen) : null;
        };

        const finalLat = parseCoord(
            rawLatitude ??
            req.headers['x-latitude'] ??
            req.headers['x-lat'] ??
            req.query?.latitude ??
            req.query?.lat
        );

        const finalLng = parseCoord(
            rawLongitude ??
            req.headers['x-longitude'] ??
            req.headers['x-long'] ??
            req.headers['x-lng'] ??
            req.query?.longitude ??
            req.query?.long ??
            req.query?.lng
        );

        const finalLocationSource = parseSource(
            rawLocationSource ??
            req.headers['x-location-source'] ??
            req.headers['x-loc-source'] ??
            req.headers['x-client-location-source'] ??
            req.query?.location_source ??
            req.query?.locationSource
        );

        const finalCity = parseStringVal(
            rawCity ??
            req.headers['x-city'] ??
            req.headers['x-client-city'] ??
            req.query?.city
        );

        const finalCountry = parseStringVal(
            rawCountry ??
            req.headers['x-country'] ??
            req.headers['x-client-country'] ??
            req.query?.country
        );

        const finalRegion = parseStringVal(
            rawRegion ??
            req.headers['x-region'] ??
            req.headers['x-client-region'] ??
            req.query?.region
        );

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
            country: finalCountry,
            region: finalRegion,
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
