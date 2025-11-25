/**
 * @myDocBlock v2.1
 * @file /v1/health/memory (GET)
 * @external none
 * @module health-memory
 * @tag health
 * @version 1.0.1 
 * @path GET /v1/health/memory
 * @summary Returns Node.js process memory metrics and system memory metrics.
 * @description
 *   Provides standardized health information about both the Node.js process
 *   and the underlying operating system memory state. This endpoint is part of
 *   the v1 health suite and is included in the aggregator at /v1/health?complete.
 * @requestExample
 *   GET /v1/health/memory
 * @response
 *   The response follows the standardized HealthResponse shape:
 *     status: "ok" | "warn" | "fail"
 *     name: "memory"
 *     data: {
 *       process: { rss, heapTotal, heapUsed, external, arrayBuffers }
 *       system: { total, free, used }
 *     }
 * @requires
 *   - Node.js 20+
 *   - Express request/response objects
 */

import os from "node:os";
import type { Request, Response } from "express";
import type { HealthResponse } from "@models/health";

export default async function handler(req: Request, res: Response) {
    const mem = process.memoryUsage();
    const systemTotal = os.totalmem();
    const systemFree = os.freemem();

    const result: HealthResponse = {
        status: "ok",
        name: "memory",
        data: {
            process: {
                rss: mem.rss,
                heapTotal: mem.heapTotal,
                heapUsed: mem.heapUsed,
                external: mem.external,
                arrayBuffers: mem.arrayBuffers,
            },
            system: {
                total: systemTotal,
                free: systemFree,
                used: systemTotal - systemFree,
            },
        },
    };

    res.json(result);
}
