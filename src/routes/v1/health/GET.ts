/// <reference types="node" />
/**
 * @myDocBlock v2.2
 * @file GET.ts
 * @external
 * @author william.r.oak@gmail.com
 * @module HealthIndex
 * @tag health
 * @version 4.0.0
 * @path /v1/health
 * @summary Health index, schema enumerator, and aggregator using in-memory route metadata.
 * @description
 *   Provides a dynamic health index endpoint with automatic runtime schema
 *   generation for all child health endpoints.
 *
 *   No Zod, no manual schemas, and no filesystem scanning are used. Instead,
 *   child endpoints are executed once (in internal mode) and their returned
 *   JSON structures are walked recursively to infer response schemas.
 *
 *   Resolution behavior:
 *
 *     1) GET /v1/health
 *          → Returns only child endpoint names.
 *
 *     2) GET /v1/health?all
 *          → Executes each child endpoint ONCE and returns a generated
 *            response-schema tree for each.
 *
 *     3) GET /v1/health?complete
 *          → Executes all child endpoints and returns full health results.
 *
 * @query
 *   {
 *     "all": {
 *       "type": "boolean",
 *       "optional": true,
 *       "description": "Generate and return response schema metadata for all child health endpoints"
 *     },
 *     "complete": {
 *       "type": "boolean",
 *       "optional": true,
 *       "description": "Execute all child health endpoints and return full results"
 *     }
 *   }
 *
 * @requestExample
 *   {
 *     "method": "GET",
 *     "url": "/v1/health?all"
 *   }
 *
 * @response
 *   {
 *     "status": "ok",
 *     "name": "health-index",
 *     "data": {
 *       "endpoints": [
 *         {
 *           "name": "api",
 *           "responseSchema": {
 *             "uptime": "number",
 *             "status": "string"
 *           }
 *         },
 *         {
 *           "name": "database",
 *           "responseSchema": {
 *             "connected": "boolean",
 *             "latency_ms": "number"
 *           }
 *         }
 *       ]
 *     }
 *   }
 *
 * @requires
 *   {
 *     "inMemory": [
 *       "req.app.locals.routeTree"
 *     ]
 *   }
 *
 */

import { Request, Response } from "express";
import { HealthResponse } from "@models/health";

/* =============================================================================
 *  Schema Generator
 * =============================================================================
 */

/**
 * Recursively walk a value and return a type metadata tree.
 *
 * Example:
 *   { uptime: 3.14, flags: ["x","y"], sys: { total: 1, used: 2 } }
 *
 * Produces:
 *   {
 *     uptime: "number",
 *     flags: ["string"],
 *     sys: { total: "number", used: "number" }
 *   }
 */
function generateSchemaFromValue(value: any): any {
    if (value === null) return "null";
    if (value === undefined) return "undefined";

    const t = typeof value;

    if (t === "number" || t === "string" || t === "boolean") {
        return t;
    }

    if (Array.isArray(value)) {
        if (value.length === 0) {
            return ["unknown"]; // empty array → unknown element type
        }
        return [generateSchemaFromValue(value[0])];
    }

    if (t === "object") {
        const shape: Record<string, any> = {};
        for (const key of Object.keys(value)) {
            shape[key] = generateSchemaFromValue(value[key]);
        }
        return shape;
    }

    return "unknown";
}

/* =============================================================================
 *  RouteTree Access Helpers
 * =============================================================================
 */

function getHealthNode(req: Request) {
    const tree = req.app.locals.routeTree;
    const node = tree["/v1/health"];

    if (!node) {
        throw new Error("HealthIndex: routeTree missing /v1/health node");
    }

    return node;
}

function listChildEndpoints(req: Request): string[] {
    const node = getHealthNode(req);
    return Object.keys(node.children);
}

/* =============================================================================
 *  Execute Children (Internal Mode)
 * =============================================================================
 */

async function executeChildHealth(
    req: Request,
    childName: string
): Promise<HealthResponse> {
    const node = getHealthNode(req);
    const child = node.children[childName];

    if (!child) {
        return {
            status: "fail",
            name: childName,
            data: { error: "Child endpoint not found" }
        };
    }

    const handler = child.handlers.GET;

    if (typeof handler !== "function") {
        return {
            status: "fail",
            name: childName,
            data: { error: "No GET handler for child endpoint" }
        };
    }

    // Fake response object — triggers internal mode in child handlers
    const fakeReq = Object.assign(Object.create(Object.getPrototypeOf(req)), req);
    const fakeRes = {} as Response;

    try {
        const result = await handler(fakeReq, fakeRes);

        if (
            typeof result === "object" &&
            result !== null &&
            "status" in result &&
            "name" in result &&
            "data" in result
        ) {
            return result as HealthResponse;
        }

        // Fallback: wrap non-standard result
        return {
            status: "ok",
            name: childName,
            data: result
        };
    } catch (err: any) {
        return {
            status: "fail",
            name: childName,
            data: { error: err?.message ?? "unknown error" }
        };
    }
}

/* =============================================================================
 *  Main Endpoint Handler
 * =============================================================================
 */

export default async function handler(req: Request) {
    const endpoints = listChildEndpoints(req);

    const hasAll = "all" in req.query;
    const hasComplete = "complete" in req.query;

    // -------------------------------------------------------------------------
    // Case 1 — only list endpoint names
    // -------------------------------------------------------------------------
    if (!hasAll && !hasComplete) {
        return {
            status: "ok",
            name: "health-index",
            data: { endpoints }
        };
    }

    // -------------------------------------------------------------------------
    // Case 2 — ?all → generate schema metadata
    // -------------------------------------------------------------------------
    if (hasAll) {
        const detailed: Array<{ name: string; responseSchema: any }> = [];

        for (const name of endpoints) {
            const exec = await executeChildHealth(req, name);

            const schema =
                exec && exec.data
                    ? generateSchemaFromValue(exec.data)
                    : null;

            detailed.push({
                name,
                responseSchema: schema
            });
        }

        return {
            status: "ok",
            name: "health-index",
            data: { endpoints: detailed }
        };
    }

    // -------------------------------------------------------------------------
    // Case 3 — ?complete → execute all health checks fully
    // -------------------------------------------------------------------------
    if (hasComplete) {
        const results: Record<string, HealthResponse> = {};

        for (const name of endpoints) {
            results[name] = await executeChildHealth(req, name);
        }

        return {
            status: "ok",
            name: "health-index",
            data: { results }
        };
    }

    // -------------------------------------------------------------------------
    // Fallback — should not occur
    // -------------------------------------------------------------------------
    return {
        status: "ok",
        name: "health-index",
        data: { endpoints }
    };
}
