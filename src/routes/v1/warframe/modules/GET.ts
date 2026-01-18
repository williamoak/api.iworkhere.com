/**
 * @myDocBlock v2.2
 * @file GET.ts
 * @external
 * @module warframe-modules
 * @tag modules
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path /v1/warframe/modules
 * @summary Retrieve module list and optionally resolve a single module.
 *
 * @description
 *   Returns a stable response containing:
 *
 *   - A lightweight list of all modules
 *   - A single resolved module object
 *
 *   Resolution priority is:
 *     1. mod_id query parameters (first match wins)
 *     2. Exact name match if no mod_id is supplied
 *
 *   If no match is found, the module field is returned as an empty
 *   module DTO to preserve a stable response shape.
 *
 * @query
 *   {
 *     "mod_id": {
 *       "type": "string",
 *       "format": "uuid",
 *       "required": false,
 *       "multiple": true,
 *       "description": "Module identifiers to resolve; first match wins"
 *     },
 *     "name": {
 *       "type": "string",
 *       "required": false,
 *       "description": "Exact module name to resolve if no mod_id is supplied"
 *     }
 *   }
 *
 * @requestExample
 *   {
 *     "method": "GET",
 *     "url": "/v1/warframe/modules?mod_id=550e8400-e29b-41d4-a716-446655440000"
 *   }
 *
 * @response
 *   {
 *     "success": true,
 *     "data": {
 *       "modules": [
 *         {
 *           "mod_id": "550e8400-e29b-41d4-a716-446655440000",
 *           "name": "Vitality"
 *         },
 *         {
 *           "mod_id": "660e8400-e29b-41d4-a716-446655440001",
 *           "name": "Redirection"
 *         }
 *       ],
 *       "module": {
 *         "mod_id": "550e8400-e29b-41d4-a716-446655440000",
 *         "name": "Vitality",
 *         "description": "Increases Warframe health.",
 *         "rarity": "common",
 *         "polarity": "vazarin",
 *         "rank_max": 10
 *       }
 *     }
 *   }
 *
 * @requires
 *   - Database connection via dbService
 *   - modules table schema
 *   - DTO mapping via toModuleDTO()
 *   - emptyModule() for non-resolved responses
 */

import type { IncomingMessage, ServerResponse } from "http";
import { URL } from "url";

import { db } from "@services/dbService";
import { modules } from "@db/schema";
import { inArray, eq } from "drizzle-orm";
import { emptyModule, toModuleDTO } from "@src/dto/module";

/**
 * GET /v1/warframe/modules
 *
 * Query params:
 *   - mod_id (UUID)        optional, may appear multiple times
 *   - name (string)       optional, exact match
 *
 * Response shape (always stable):
 * {
 *   modules: [{ mod_id, name }]
 *   module: { ...full module object (empty or populated) }
 * }
 */
export default async function GET(
    req: IncomingMessage,
    res: ServerResponse
) {
    try {
        const url = new URL(req.url ?? "", "http://localhost");

        const modIds = url.searchParams.getAll("mod_id");
        const name = url.searchParams.get("name");

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

        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(
            JSON.stringify({
                success: true,
                data: {
                    modules: moduleList,
                    module: currentModule,
                },
            })
        );
    } catch (err) {
        console.error("GET /modules error:", err);

        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(
            JSON.stringify({
                success: false,
                error: "Internal server error",
            })
        );
    }
}
