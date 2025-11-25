/**
 * @file GET.ts
 * @external none
 * @module HealthApi
 * @tag health
 * @version 2.0.0
 * @path src/routes/v1/health/api/GET.ts
 * @summary API-only health check (standard health format).
 * @description
 *   Returns basic health information about the API server,
 *   using the NEW standard health shape:
 *
 *   {
 *     status: "ok" | "warn" | "fail",
 *     name:   string,
 *     data:   object
 *   }
 *
 * @requestExample none
 * @response
 * {
 *   "status": "ok",
 *   "name": "api",
 *   "data": {
 *     "uptime": 123.45
 *   }
 * }
 * @requires none
 */

import { Request, Response } from "express";
import { HealthResponse } from "@models/health";

export default async function handler(req: Request, res: Response): Promise<HealthResponse> {
    return {
        status: "ok",
        name: "api",
        data: {
            uptime: process.uptime()
        }
    };
}
