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

    return res.json({ ok: true });
}
