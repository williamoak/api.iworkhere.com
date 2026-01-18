/**
 * @myDocBlock v2.2
 * @file GET.ts
 * @external
 * @module HealthApi
 * @tag health
 * @version 3.0.0
 * @path /v1/health/api
 * @summary Basic API server health check (uptime only).
 * @description
 *   Provides a minimal API health endpoint reporting process uptime.
 *
 *   Supports dual-mode execution:
 *     1) Internal invocation by the /v1/health aggregator
 *     2) External HTTP invocation via Express
 *
 *   Internal mode:
 *     - Handler returns a HealthResponse object directly
 *
 *   External mode:
 *     - Handler responds via res.json(HealthResponse)
 *
 * @query
 *   {}
 *
 * @requestExample
 *   {
 *     "method": "GET",
 *     "url": "/v1/health/api"
 *   }
 *
 * @response
 *   {
 *     "status": "ok",
 *     "name": "api",
 *     "data": {
 *       "uptime": 123.45
 *     }
 *   }
 *
 * @requires
 *   {
 *     "runtime": [
 *       "process.uptime"
 *     ]
 *   }
 *
 * @author william.r.oak@gmail.com
 */

import { Request, Response } from "express";
import { HealthResponse } from "@models/health";

/**
 * Detect internal invocation:
 *   - fakeRes from the aggregator does NOT include json()
 */
function isInternalInvocation(res: Response): boolean {
    return typeof (res as any).json !== "function";
}

export default async function handler(
    _req: Request,
    res: Response
): Promise<HealthResponse | void | Response> {

    const response: HealthResponse = {
        status: "ok",
        name: "api",
        data: {
            uptime: process.uptime()
        }
    };

    //
    // INTERNAL call (from /v1/health aggregator)
    //
    if (isInternalInvocation(res)) {
        return response;
    }

    //
    // EXTERNAL call (normal HTTP request)
    //
    return res.json(response);
}

export const __test__ = {
    isInternalInvocation
};
