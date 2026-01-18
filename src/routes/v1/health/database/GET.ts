/**
 * @myDocBlock v2.2
 * @file GET.ts
 * @external api.iworkhere.com
 * @module health-database
 * @tag health
 * @version 2.0.0
 * @author william.r.oak@gmail.com
 * @path /v1/health/database
 * @summary CockroachDB health check for latency, version, and build metadata.
 * @description
 *   Provides a CockroachDB health endpoint reporting SQL latency, build metadata,
 *   version information, and connectivity status.
 *
 *   Supports dual invocation modes:
 *
 *     1) External HTTP invocation via Express
 *        → Handler writes JSON directly to the Express response.
 *
 *     2) Internal invocation by the /v1/health aggregator
 *        → Handler receives a synthetic response object and MUST return a
 *          HealthResponse object instead of calling res.json().
 *
 *   This dual-mode behavior enables:
 *     • Zero-latency child health execution
 *     • Hierarchical route metadata traversal
 *     • Parent → child aggregation for /v1/health?complete
 *
 * @query
 *   {}
 *
 * @requestExample
 *   {
 *     "method": "GET",
 *     "url": "/v1/health/database"
 *   }
 *
 * @response
 *   {
 *     "status": "ok",
 *     "name": "database",
 *     "data": {
 *       "latencyMs": 2.31,
 *       "version": "v24.1.3",
 *       "details": {
 *         "tag": "v24.1.3"
 *       },
 *       "nodes": [],
 *       "nodeCount": 1,
 *       "mTLSActive": true
 *     }
 *   }
 *
 * @requires
 *   {
 *     "database": [
 *       "@services/dbService.query"
 *     ]
 *   }
 *
 */

import type { Request, Response } from "express";
import type { HealthResponse } from "@models/health";
import { query } from "@services/dbService";

/**
 * Convert Cockroach key/value metadata rows into a simple object.
 */
function normalizeNodeBuildInfo(rows: any[]): Record<string, string> {
    const info: Record<string, string> = {};
    for (const row of rows ?? []) {
        if (row.field && row.value !== undefined) {
            info[row.field] = String(row.value);
        }
    }
    return info;
}

/**
 * Extract version tag from the metadata object.
 */
function extractVersion(info: Record<string, string>): string {
    return (
        info["tag"] ||
        info["version"] ||
        info["Version"] ||
        "unknown"
    );
}

/**
 * Detect whether this invocation is internal (aggregator) or external (HTTP).
 */
function isInternalInvocation(res: Response): boolean {
    //
    // The health aggregator passes a lightweight fakeRes object that:
    //   • does NOT have Express methods like json(), status(), etc.
    //   • is only used to satisfy handler(req, res) signature
    //
    // Therefore: "json" not being a function → internal invocation.
    //
    return typeof (res as any).json !== "function";
}

/**
 * Main health check handler (GET /v1/health/database)
 *
 * Supports two modes:
 *   • External HTTP mode → writes JSON to Express res
 *   • Internal health-aggregator mode → returns HealthResponse object
 */
export default async function handler(
    _req: Request,
    res: Response
): Promise<HealthResponse | void | Response> {
    const start = performance.now();

    try {
        //
        // 1. Round-trip SQL latency
        //
        await query("SELECT now()");
        const latencyMs = performance.now() - start;

        //
        // 2. Build metadata + version
        //
        const buildResult = await query("SELECT * FROM crdb_internal.node_build_info");
        const buildRows = buildResult.rows ?? [];
        const details = normalizeNodeBuildInfo(buildRows);
        const version = extractVersion(details);

        //
        // 3. Node count (single-node Cockroach deployment)
        //
        const nodeCount = 1;

        //
        // 4. mTLS active (placeholder)
        //
        const mTLSActive = true;

        //
        // 5. Standard response format
        //
        const response: HealthResponse = {
            status: "ok",
            name: "database",
            data: {
                latencyMs,
                version,
                details,
                nodes: [],
                nodeCount,
                mTLSActive
            }
        };

        //
        // INTERNAL call (aggregator)
        //
        if (isInternalInvocation(res)) {
            return response;
        }

        //
        // EXTERNAL call (normal HTTP request)
        //
        return res.json(response);

    } catch (err: any) {
        const failure: HealthResponse = {
            status: "fail",
            name: "database",
            data: { error: err?.message ?? "Unknown database error" }
        };

        //
        // INTERNAL call
        //
        if (isInternalInvocation(res)) {
            return failure;
        }

        //
        // EXTERNAL call
        //
        return res.status(500).json(failure);
    }
}

export const __test__ = {
    normalizeNodeBuildInfo,
    extractVersion,
    isInternalInvocation
};
