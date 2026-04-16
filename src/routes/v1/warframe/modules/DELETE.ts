/**
 * @myDocBlock v2.3
 * @file DELETE.ts
 * @external
 * @module warframe.modules
 * @tag warframe.modules
 * @version 1.0.1
 * @author william.r.oak@gmail.com
 * @path /v1/warframe/modules
 * @summary Delete a module by mod_id.
 *
 * @description
 * Deletes a single Warframe module identified by the required mod_id query parameter.
 *
 * If no matching record exists, the operation still succeeds and returns a null data payload.
 *
 * @query
 * {
 *   "mod_id": {
 *     "type": "string",
 *     "required": true,
 *     "description": "Unique identifier of the module to delete"
 *   }
 * }
 *
 * @requestExample
 * {
 *   "method": "DELETE",
 *   "url": "/v1/warframe/modules?mod_id=<MOD_ID>"
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
 *   "tables": ["modules"],
 *   "services": ["dbService"]
 * }
 */

import type { Request, Response } from "express";
import { eq } from "drizzle-orm";

import { db } from "@services/dbService";
import { modules } from "@db/schema";

/**
 * DELETE /v1/warframe/modules
 */
export default async function DELETE(req: Request, res: Response) {
    try {
        const modIdRaw = req.query.mod_id;

        const modId =
            typeof modIdRaw === "string"
                ? modIdRaw
                : Array.isArray(modIdRaw) && typeof modIdRaw[0] === "string"
                    ? modIdRaw[0]
                    : undefined;

        if (!modId) {
            return res.status(400).json({
                success: false,
                error: "mod_id is required",
            });
        }

        const rows = await db
            .delete(modules)
            .where(eq(modules.modId, modId))
            .returning();

        const result = rows.length > 0 ? rows[0] : null;

        return res.status(200).json({
            success: true,
            data: result,
        });
    } catch (err) {
        console.error("DELETE /modules error:", err);

        return res.status(500).json({
            success: false,
            error: "Internal server error",
        });
    }
}
