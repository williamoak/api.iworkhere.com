/**
 * @myDocBlock v2.3
 * @file GET.ts
 * @external
 * @module routes/v1/warframe/modules
 * @tag warframe
 * @version 1.0.1
 * @author william.r.oak@gmail.com
 * @path /v1/warframe/modules
 * @summary Retrieve module list and optionally resolve a single module.
 *
 * @description
 * Returns a stable response containing:
 * - A lightweight list of all modules
 * - A single resolved module object
 *
 * Resolution priority is:
 * 1) mod_id query parameters (first match wins)
 * 2) Exact name match if no mod_id is supplied
 *
 * If no match is found, the module field is returned as an empty module DTO
 * to preserve a stable response shape.
 *
 * @query
 * {
 *   "mod_id": {
 *     "type": "string",
 *     "required": false,
 *     "description": "Module identifiers to resolve; first match wins (repeatable query param)"
 *   },
 *   "name": {
 *     "type": "string",
 *     "required": false,
 *     "description": "Exact module name to resolve if no mod_id is supplied"
 *   }
 * }
 *
 * @requestExample
 * {
 *   "method": "GET",
 *   "url": "/v1/warframe/modules?mod_id=<MOD_ID>"
 * }
 *
 * @response
 * {
 *   "success": true,
 *   "data": {
 *     "modules": [
 *       { "mod_id": "<MOD_ID>", "name": "Vitality" }
 *     ],
 *     "module": {}
 *   }
 * }
 *
 * @requires
 * {
 *   "tables": ["modules"],
 *   "services": ["dbService"],
 *   "mappers": ["toModuleDTO", "emptyModule"]
 * }
 */

import type { Request, Response } from "express";
import { inArray, eq } from "drizzle-orm";

import { db } from "@services/dbService";
import { modules } from "@db/schema";
import { emptyModule, toModuleDTO } from "@src/dto/module";

/**
 * GET /v1/warframe/modules
 */
export default async function GET(req: Request, res: Response) {
    try {
        const modIdsRaw = req.query.mod_id;
        const modIds =
            typeof modIdsRaw === "string"
                ? [modIdsRaw]
                : Array.isArray(modIdsRaw)
                    ? modIdsRaw.filter((v): v is string => typeof v === "string")
                    : [];

        const nameRaw = req.query.name;
        const name = typeof nameRaw === "string" ? nameRaw : undefined;

        // --- Always fetch lightweight module list ---
        const moduleList = await db
            .select({
                mod_id: modules.modId,
                name: modules.name,
            })
            .from(modules);

        let currentModule = emptyModule();

        // ---------------------------------
        // Priority 1: mod_id
        // ---------------------------------
        if (modIds.length > 0) {
            const rows = await db
                .select()
                .from(modules)
                .where(inArray(modules.modId, modIds));

            if (rows.length > 0) {
                currentModule = toModuleDTO(rows[0]);
            }
        }

        // ---------------------------------
        // Priority 2: name
        // ---------------------------------
        else if (name) {
            const rows = await db
                .select()
                .from(modules)
                .where(eq(modules.name, name));

            if (rows.length > 0) {
                currentModule = toModuleDTO(rows[0]);
            }
        }

        return res.status(200).json({
            success: true,
            data: {
                modules: moduleList,
                module: currentModule,
            },
        });
    } catch (err) {
        console.error("GET /modules error:", err);

        return res.status(500).json({
            success: false,
            error: "Internal server error",
        });
    }
}
