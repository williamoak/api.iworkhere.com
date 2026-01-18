/**
 * @myDocBlock v2.2
 * @file DELETE.ts
 * @external
 * @module warframe-weapons
 * @tag weapons
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path /v1/warframe/weapons
 * @summary Delete a weapon by weapon_id.
 *
 * @description
 *   Deletes a single weapon identified by the required weapon_id
 *   query parameter.
 *
 *   If no matching record exists, the operation still succeeds and
 *   returns a null data payload.
 *
 * @query
 *   {
 *     "weapon_id": {
 *       "type": "string",
 *       "format": "uuid",
 *       "required": true,
 *       "description": "Unique identifier of the weapon to delete"
 *     }
 *   }
 *
 * @requestExample
 *   {
 *     "method": "DELETE",
 *     "url": "/v1/warframe/weapons?weapon_id=880e8400-e29b-41d4-a716-446655440020"
 *   }
 *
 * @response
 *   {
 *     "success": true,
 *     "data": {
 *       "weapon_id": "880e8400-e29b-41d4-a716-446655440020",
 *       "name": "Braton",
 *       "type": "rifle",
 *       "damage": 35
 *     }
 *   }
 *
 * @requires
 *   - Database connection via dbService
 *   - weapons table schema
 */

import type { IncomingMessage, ServerResponse } from "http";
import { URL } from "url";

import { db } from "@services/dbService";
import { weapons } from "@db/schema";
import { eq } from "drizzle-orm";

/**
 * DELETE /v1/warframe/weapons
 * Query param:
 *   - weapon_id (UUID, required)
 */
export default async function DELETE(
    req: IncomingMessage,
    res: ServerResponse
) {
    try {
        const url = new URL(req.url ?? "", "http://localhost");
        const weaponId = url.searchParams.get("weapon_id");

        if (!weaponId) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(
                JSON.stringify({
                    success: false,
                    error: "weapon_id is required",
                })
            );
            return;
        }

        const rows = await db
            .delete(weapons)
            .where(eq(weapons.weaponId, weaponId))
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
        console.error("DELETE /weapons error:", err);

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
