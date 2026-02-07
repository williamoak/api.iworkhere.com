/**
 * @myDocBlock v2.3
 * @file GET.ts
 * @external
 * @module routes/v1/warframe/warframes
 * @tag warframe
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path /v1/warframe/warframes
 * @summary Fetch warframe list and optionally a single warframe by id.
 * @description
 * Returns a lightweight list of warframes (id + name) and, if one or more
 * warframe_id query parameters are provided, also returns a single resolved
 * warframe object (the first match).
 *
 * @query
 * {
 *   "warframe_id": {
 *     "type": "string",
 *     "required": false,
 *     "description": "One or more warframe IDs to resolve (repeatable query param)"
 *   }
 * }
 *
 * @requestExample
 * {
 *   "method": "GET",
 *   "url": "/v1/warframe/warframes?warframe_id=<WARFRAME_ID>"
 * }
 *
 * @response
 * {
 *   "success": true,
 *   "data": {
 *     "warframes": [
 *       {
 *         "warframe_id": "<WARFRAME_ID>",
 *         "name": "Example"
 *       }
 *     ],
 *     "warframe": {}
 *   }
 * }
 *
 * @requires
 * {
 *   "tables": ["warframes"],
 *   "services": ["dbService"]
 * }
 */

import type { Request, Response } from "express";
import { inArray } from "drizzle-orm";

import { db } from "@services/dbService";
import { warframes } from "@db/schema";
import { emptyWarframe, toWarframeDTO } from "@src/dto/warframe";

/**
 * GET /v1/warframe/warframes
 */
export default async function GET(req: Request, res: Response) {
    try {
        const warframeIdsRaw = req.query.warframe_id;
        const warframeIds =
            typeof warframeIdsRaw === "string"
                ? [warframeIdsRaw]
                : Array.isArray(warframeIdsRaw)
                    ? warframeIdsRaw.filter((v): v is string => typeof v === "string")
                    : [];

        /* --------------------------------------------------
         * 1) Always fetch lightweight warframe list
         * -------------------------------------------------- */

        const warframeList = await db
            .select({
                warframe_id: warframes.warframeId,
                name: warframes.name,
            })
            .from(warframes);

        let currentWarframe = emptyWarframe();

        /* --------------------------------------------------
         * 2) Resolve a single warframe if requested
         * -------------------------------------------------- */

        if (warframeIds.length > 0) {
            const rows = await db
                .select()
                .from(warframes)
                .where(inArray(warframes.warframeId, warframeIds));

            if (rows.length > 0) {
                currentWarframe = toWarframeDTO(rows[0]);
            }
        }

        return res.status(200).json({
            success: true,
            data: {
                warframes: warframeList,
                warframe: currentWarframe,
            },
        });
    } catch (err) {
        console.error("GET /warframes error:", err);

        return res.status(500).json({
            success: false,
            error: "Internal server error",
        });
    }
}