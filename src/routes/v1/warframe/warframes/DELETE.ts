/**
 * @myDocBlock v2.2
 * @file DELETE.ts
 * @external
 * @module warframe-warframes
 * @tag warframes
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path /v1/warframe/warframes
 * @summary Delete a warframe by warframe_id.
 *
 * @description
 *   Deletes a single warframe identified by the required warframe_id
 *   query parameter.
 *
 *   If no matching record exists, the operation still succeeds and
 *   returns a null data payload.
 *
 * @query
 *   {
 *     "warframe_id": {
 *       "type": "string",
 *       "format": "uuid",
 *       "required": true,
 *       "description": "Unique identifier of the warframe to delete"
 *     }
 *   }
 *
 * @requestExample
 *   {
 *     "method": "DELETE",
 *     "url": "/v1/warframe/warframes?warframe_id=660e8400-e29b-41d4-a716-446655440010"
 *   }
 *
 * @response
 *   {
 *     "success": true,
 *     "data": {
 *       "warframe_id": "660e8400-e29b-41d4-a716-446655440010",
 *       "name": "Excalibur",
 *       "health": 100,
 *       "shield": 100,
 *       "armor": 225,
 *       "energy": 100
 *     }
 *   }
 *
 * @requires
 *   - Database connection via dbService
 *   - warframe table schema
 */


import type { IncomingMessage, ServerResponse } from "http";
import { URL } from "url";

import { db } from "@services/dbService";
import { warframe } from "@db/schema";
import { eq } from "drizzle-orm";

/**
 * DELETE /v1/warframe/warframes
 * Query param:
 *   - warframe_id (UUID, required)
 */
export default async function DELETE(
    req: IncomingMessage,
    res: ServerResponse
) {
    try {
        const url = new URL(req.url ?? "", "http://localhost");
        const warframeId = url.searchParams.get("warframe_id");

        if (!warframeId) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(
                JSON.stringify({
                    success: false,
                    error: "warframe_id is required",
                })
            );
            return;
        }

        const rows = await db
            .delete(warframe)
            .where(eq(warframe.warframeId, warframeId))
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
        console.error("DELETE /warframes error:", err);

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
