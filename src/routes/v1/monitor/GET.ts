/**
 * @myDocBlock v2.2
 * @file GET.ts
 * @external
 * @module monitor-index
 * @tag monitor
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path /v1/monitor
 * @summary Basic monitor endpoint returning an OK status.
 *
 * @description
 *   Provides a minimal monitoring signal indicating that the API process
 *   is running and responsive.
 *
 *   External HTTP requests receive a simple JSON object suitable for
 *   uptime monitoring, load balancer probes, and basic diagnostics.
 *
 *   Internal invocations (such as monitoring aggregators or self-tests)
 *   receive the same object directly as a return value, avoiding HTTP
 *   loopback overhead.
 *
 * @query
 *   {}
 *
 * @requestExample
 *   { "method": "GET", "url": "/v1/monitor" }
 *
 * @response
 *   { "ok": true }
 *
 * @requires none
 */

import { Request, Response } from "express";

/**
 * Internal invocation detection:
 * The routeLoader’s fakeRes object does not have json().
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
    // INTERNAL mode → return value directly
    //
    if (isInternalInvocation(res)) {
        return payload;
    }

    //
    // EXTERNAL HTTP mode → write JSON
    //
    return res.json(payload);
}
