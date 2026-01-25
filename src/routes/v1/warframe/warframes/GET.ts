/**
 * @myDocBlock v2.2
 * @file GET.ts
 * @external
 * @module warframe-warframes
 * @tag warframes
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path /v1/warframe/warframes
 * @summary Retrieve warframe list and optionally resolve a single warframe.
 *
 * @description
 *   Returns a stable response containing:
 *
 *   - A lightweight list of all warframes
 *   - A single resolved warframe object
 *
 *   If one or more warframe_id query parameters are supplied, the first
 *   matching warframe is resolved and returned.
 *
 *   If no matching record is found, the warframe field is returned as an
 *   empty warframe DTO to preserve a stable response shape.
 *
 * @query
 *   {
 *     "warframe_id": {
 *       "type": "string",
 *       "format": "uuid",
 *       "required": false,
 *       "multiple": true,
 *       "description": "Warframe identifiers to resolve; first match wins"
 *     }
 *   }
 *
 * @requestExample
 *   {
 *     "method": "GET",
 *     "url": "/v1/warframe/warframes?warframe_id=660e8400-e29b-41d4-a716-446655440010"
 *   }
 *
 * @response
 *   {
 *     "success": true,
 *     "data": {
 *       "warframes": [
 *         {
 *           "warframe_id": "660e8400-e29b-41d4-a716-446655440010",
 *           "name": "Excalibur"
 *         },
 *         {
 *           "warframe_id": "770e8400-e29b-41d4-a716-446655440011",
 *           "name": "Mag"
 *         }
 *       ],
 *       "warframe": {
 *         "warframe_id": "660e8400-e29b-41d4-a716-446655440010",
 *         "name": "Excalibur",
 *         "health": 100,
 *         "shield": 100,
 *         "armor": 225,
 *         "energy": 100
 *       }
 *     }
 *   }
 *
 * @requires
 *   - Database connection via dbService
 *   - warframe table schema
 *   - DTO mapping via toWarframeDTO()
 *   - emptyWarframe() for non-resolved responses
 */

import type { IncomingMessage, ServerResponse } from "http";
import { URL } from "url";

import { db } from "@services/dbService";
import { warframes } from "@db/schema";
import { inArray } from "drizzle-orm";
import { emptyWarframe, toWarframeDTO } from "@src/dto/warframe";

/**
 * GET /v1/warframe/warframes
 */
export default async function GET(
    req: IncomingMessage,
    res: ServerResponse
) {
    try {
        const url = new URL(req.url ?? "", "http://localhost");
        const warframeIds = url.searchParams.getAll("warframe_id");

        // --------------------------------------------------
        // 1) Always fetch lightweight warframe list
        // --------------------------------------------------
        const warframes = await db
            .select({
                warframe_id: warframe.warframeId,
                name: warframe.name,
            })
            .from(warframes);

        let currentWarframe = emptyWarframe();

        // --------------------------------------------------
        // 2) If one or more warframe_ids were requested
        // --------------------------------------------------
        if (warframeIds.length > 0) {
            const rows = await db
                .select()
                .from(warframe)
                .where(inArray(warframe.warframeId, warframeIds));

            if (rows.length > 0) {
                currentWarframe = toWarframeDTO(rows[0]);
            }
        }

        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(
            JSON.stringify({
                success: true,
                data: {
                    warframes,
                    warframe: currentWarframe,
                },
            })
        );
    } catch (err) {
        console.error("GET /warframes error:", err);

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
