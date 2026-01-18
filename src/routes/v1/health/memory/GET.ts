/**
 * @myDocBlock v2.2
 * @file GET.ts
 * @external
 * @module health-memory
 * @tag health
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path /v1/health/memory
 * @summary Memory health endpoint.
 *
 * @description
 *   Provides runtime memory usage information for both the Node.js process
 *   and the underlying operating system.
 *
 *   External HTTP requests receive a structured JSON health response suitable
 *   for health checks, diagnostics, and dashboards.
 *
 *   Internal invocations (such as health aggregators) receive the same object
 *   directly as a return value, enabling efficient collection without HTTP
 *   loopback.
 *
 * @query
 *   {}
 *
 * @requestExample
 *   { "method": "GET", "url": "/v1/health/memory" }
 *
 * @response
 *   {
 *     "status": "ok",
 *     "name": "memory",
 *     "data": {
 *       "process": {
 *         "rss": 12345678,
 *         "heapTotal": 12345678,
 *         "heapUsed": 12345678,
 *         "external": 12345678,
 *         "arrayBuffers": 12345678
 *       },
 *       "system": {
 *         "total": 12345678,
 *         "free": 12345678,
 *         "used": 12345678
 *       }
 *     }
 *   }
 *
 * @requires node:os
 */

import os from "node:os";
import type { Request, Response } from "express";
import type { HealthResponse } from "@models/health";

/**
 * Detect internal invocation by the aggregator.
 * The aggregator supplies a minimal fakeRes object without json().
 */
function isInternalInvocation(res: Response): boolean {
    return typeof (res as any).json !== "function";
}

export default async function handler(
    _req: Request,
    res: Response
): Promise<HealthResponse | void | Response> {
    const mem = process.memoryUsage();
    const systemTotal = os.totalmem();
    const systemFree = os.freemem();

    const response: HealthResponse = {
        status: "ok",
        name: "memory",
        data: {
            process: {
                rss: mem.rss,
                heapTotal: mem.heapTotal,
                heapUsed: mem.heapUsed,
                external: mem.external,
                arrayBuffers: mem.arrayBuffers
            },
            system: {
                total: systemTotal,
                free: systemFree,
                used: systemTotal - systemFree
            }
        }
    };

    //
    // INTERNAL call → return object directly
    //
    if (isInternalInvocation(res)) {
        return response;
    }

    //
    // EXTERNAL HTTP call → send JSON
    //
    return res.json(response);
}
