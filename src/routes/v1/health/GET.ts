/// <reference types="node" />
/**
 * @file GET.ts
 * @external none
 * @module HealthIndex
 * @tag health
 * @version 2.0.0
 * @path src/routes/v1/health/GET.ts
 * @summary Health index, schema listing, and aggregator (standardized format).
 * @description
 *   Behaviors:
 *
 *   1) GET /v1/health
 *        → Returns only endpoint names.
 *
 *   2) GET /v1/health?all
 *        → Returns endpoint names + schema.response shapes.
 *
 *   3) GET /v1/health?complete
 *        → Executes each endpoint and returns live values using
 *          the standard health shape.
 */

import { Request } from "express";
import fs from "fs";
import path from "path";
import { internalDispatcher } from "@src/server";
import { HealthResponse } from "@models/health";

// Base folder for health sub-endpoints
const HEALTH_DIR = path.resolve("src/routes/v1/health");

/**
 * Returns list of endpoint folder names that contain a GET.ts handler.
 */
function getHealthEndpoints(): string[] {
    return fs.readdirSync(HEALTH_DIR).filter((name) => {
        const fullPath = path.join(HEALTH_DIR, name);
        return (
            fs.statSync(fullPath).isDirectory() &&
            fs.existsSync(path.join(fullPath, "GET.ts"))
        );
    });
}

/**
 * Dynamic Zod schema loader for ?all.
 */
async function loadEndpointSchema(name: string) {
    const file = path.join(HEALTH_DIR, name, "GET.ts");

    try {
        const mod = await import(`file://${file}`);

        if (!mod.schema || !mod.schema.response) {
            return null;
        }

        const z = mod.schema.response;

        if (typeof z.describe === "function") {
            return z.describe();
        }

        if (z._def) return z._def;

        return null;
    } catch {
        return null;
    }
}

/**
 * Calls a health endpoint over internal HTTPS and ensures
 * the result is in standard HealthResponse shape.
 */
async function callHealth(name: string): Promise<HealthResponse> {
    const url = `https://api.iworkhere.com:4300/v1/health/${name}`;

    try {
        const res = await fetch(url, {
            dispatcher: internalDispatcher
        });

        if (!res.ok) {
            return {
                status: "fail",
                name,
                data: {
                    httpStatus: res.status,
                    message: `HTTP ${res.status}`
                }
            };
        }

        const json: unknown = await res.json();

        // Type guard for fully-formed HealthResponse
        if (
            typeof json === "object" &&
            json !== null &&
            "status" in json &&
            "name" in json &&
            "data" in json &&
            typeof (json as any).status === "string" &&
            typeof (json as any).name === "string"
        ) {
            return json as HealthResponse;   // <-- safe, validated narrowing
        }

        // Fallback: wrap older or untyped data
        return {
            status: "ok",
            name,
            data: json
        };
    } catch (err: any) {
        return {
            status: "fail",
            name,
            data: {
                error: err.message ?? "unknown error"
            }
        };
    }
}

/**
 * Main handler.
 */
export default async function handler(req: Request) {
    const endpoints = getHealthEndpoints();

    const hasAll = "all" in req.query;
    const hasComplete = "complete" in req.query;

    //
    // Case 1 — simple listing (unchanged)
    //
    if (!hasAll && !hasComplete) {
        return {
            status: "ok",
            name: "health-index",
            data: { endpoints }
        };
    }

    //
    // Case 2 — ?all → list + schemas
    //
    if (hasAll) {
        const detailed: Array<{ name: string; responseSchema: any }> = [];

        for (const name of endpoints) {
            const schema = await loadEndpointSchema(name);
            detailed.push({ name, responseSchema: schema });
        }

        return {
            status: "ok",
            name: "health-index",
            data: { endpoints: detailed }
        };
    }

    //
    // Case 3 — ?complete → execute all health checks
    //
    if (hasComplete) {
        const results: Record<string, HealthResponse> = {};

        for (const name of endpoints) {
            results[name] = await callHealth(name);
        }

        return {
            status: "ok",
            name: "health-index",
            data: { results }
        };
    }

    //
    // Fallback (unreachable)
    //
    return {
        status: "ok",
        name: "health-index",
        data: { endpoints }
    };
}
