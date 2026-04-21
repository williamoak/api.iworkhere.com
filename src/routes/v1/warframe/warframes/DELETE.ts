/**
 * @myDocBlock v2.3
 * @file DELETE.ts
 * @external
 * @module warframe.warframes
 * @tag warframe.warframes
 * @version 1.0.1
 * @author william.r.oak@gmail.com
 * @path /v1/warframe/warframes
 * @summary Delete a warframe by warframe_id.
 * @description
 * Deletes a single warframe identified by the required warframe_id query parameter.
 *
 * If no matching record exists, the operation still succeeds and returns a null data payload.
 *
 * @query
 * {
 *   "warframe_id": {
 *     "type": "string",
 *     "required": true,
 *     "description": "Unique identifier of the warframe to delete"
 *   }
 * }
 *
 * @requestExample
 * {
 *   "method": "DELETE",
 *   "url": "/v1/warframe/warframes?warframe_id=<WARFRAME_ID>"
 * }
 *
 * @response
 * {
 *   "success": true,
 *   "data": {}
 * }
 *
 * @requires
 * {
 *   "tables": ["warframes"],
 *   "services": ["dbService"]
 * }
 */

import type { Request, Response } from "express";
import { eq } from "drizzle-orm";

import { db } from "@services/dbService";
import { warframes } from "@db/schema";

/**
 * DELETE /v1/warframe/warframes
 * Query param:
 *   - warframe_id (required)
 */
export default async function DELETE(req: Request, res: Response) {
    try {
        const warframeIdRaw = req.query.warframe_id;
        const warframeId =
            typeof warframeIdRaw === "string"
                ? warframeIdRaw
                : Array.isArray(warframeIdRaw) && typeof warframeIdRaw[0] === "string"
                    ? warframeIdRaw[0]
                    : undefined;

        if (!warframeId) {
            return res.status(400).json({
                success: false,
                error: "warframe_id is required",
            });
        }

        const rows = await db
            .delete(warframes)
            .where(eq(warframes.warframeId, warframeId))
            .returning();

        const result = rows.length > 0 ? rows[0] : null;

        return res.status(200).json({
            success: true,
            data: result,
        });
    } catch (err) {
        console.error("DELETE /warframes error:", err);

        return res.status(500).json({
            success: false,
            error: "Internal server error",
        });
    }
}
