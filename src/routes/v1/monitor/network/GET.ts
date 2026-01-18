/**
 * @myDocBlock v2.2
 * @file GET.ts
 * @external
 * @module monitor-network
 * @tag monitor
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path /v1/monitor/network
 * @summary Network monitoring stub endpoint.
 * @description
 *   Provides a minimal network monitoring endpoint that confirms the API
 *   server is responsive.
 *
 *   Supports dual-mode execution:
 *
 *     1) External HTTP invocation
 *        → Responds via res.json({ ok: true }).
 *
 *     2) Internal invocation (future monitoring aggregator)
 *        → Returns the payload object directly.
 *
 *   Dual-mode support allows this endpoint to be incorporated into a
 *   high-speed monitoring or aggregation system without HTTP loopback.
 *
 * @query
 *   {}
 *
 * @requestExample
 *   {
 *     "method": "GET",
 *     "url": "/v1/monitor/network"
 *   }
 *
 * @response
 *   {
 *     "ok": true
 *   }
 *
 * @requires
 *   {
 *     "runtime": [
 *       "Express"
 *     ]
 *   }
 */

import { Request, Response } from "express";

/**
 * Detect internal invocation.
 */
function isInternalInvocation(res: Response): boolean {
    return typeof (res as any).json !== "function";
}

export default async function handler(
    _req: Request,
    res: Response
): Promise<{ ok: true } | void | Response> {

    // FIXED: literal type preserved
    const payload = { ok: true } as const;

    //
    // INTERNAL call → return object directly
    //
    if (isInternalInvocation(res)) {
        return payload;
    }

    //
    // EXTERNAL HTTP call → send JSON
    //
    return res.json(payload);
}
