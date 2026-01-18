/**
 * @myDocBlock v2.2
 * @file DELETE.ts
 * @external
 * @module warframe-modules
 * @tag modules
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path /v1/warframe/modules
 * @summary Delete a module by mod_id.
 *
 * @description
 *   Deletes a single Warframe module identified by the required mod_id
 *   query parameter.
 *
 *   If no matching record exists, the operation still succeeds and
 *   returns a null data payload.
 *
 * @query
 *   {
 *     "mod_id": {
 *       "type": "string",
 *       "format": "uuid",
 *       "required": true,
 *       "description": "Unique identifier of the module to delete"
 *     }
 *   }
 *
 * @requestExample
 *   {
 *     "method": "DELETE",
 *     "url": "/v1/warframe/modules?mod_id=550e8400-e29b-41d4-a716-446655440000"
 *   }
 *
 * @response
 *   {
 *     "success": true,
 *     "data": {
 *       "mod_id": "550e8400-e29b-41d4-a716-446655440000",
 *       "name": "Vitality",
 *       "description": "Increases Warframe health.",
 *       "rarity": "common",
 *       "polarity": "vazarin",
 *       "rank_max": 10
 *     }
 *   }
 *
 * @requires
 *   - Database connection via dbService
 *   - modules table schema
 */

import type { IncomingMessage, ServerResponse } from "http";
import { URL } from "url";

import { db } from "@services/dbService";
import { modules } from "@db/schema";
import { eq } from "drizzle-orm";

/**
 * DELETE /v1/warframe/modules
 * Query param:
 *   - mod_id (UUID, required)
 */
export default async function DELETE(
    req: IncomingMessage,
    res: ServerResponse
) {
    try {
        const url = new URL(req.url ?? "", "http://localhost");
        const modId = url.searchParams.get("mod_id");

        if (!modId) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(
                JSON.stringify({
                    success: false,
                    error: "mod_id is required",
                })
            );
            return;
        }

        const rows = await db
            .delete(modules)
            .where(eq(modules.modId, modId))
            .returning();

        const result = rows.length > 0 ? rows[0] : null;

        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(
            JSON.stringify({
                success: true,
                data: result,
            })
        );
    } catch (err) {
        console.error("DELETE /modules error:", err);

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
