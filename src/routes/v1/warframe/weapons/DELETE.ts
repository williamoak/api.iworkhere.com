/**
 * @myDocBlock v2.3
 * @file deleteWeapon
 * @external
 * @module warframe.weapons
 * @tag warframe.weapons
 * @version 1.0.1
 * @author william.r.oak@gmail.com
 * @path /v1/warframe/weapons
 * @summary Delete a weapon by identifier
 *
 * @description
 * Deletes a weapon record from the database using the provided weapon_id query parameter.
 * The handler extracts weapon_id from the query string, supporting both string and array forms,
 * and normalizes it to a single string value.
 *
 * If weapon_id is missing or invalid, the request is rejected with a 400 response.
 * If provided, the database delete operation is executed and the deleted row (if any) is returned.
 *
 * The endpoint always responds with success: true when the operation executes, even if no matching
 * record is found (data will be null in that case). This behavior ensures idempotency for repeated
 * delete requests on the same identifier.
 *
 * Errors during execution are logged and result in a 500 INTERNAL SERVER ERROR response.
 * @query
 * {
 *   "weapon_id": {
 *     "type": "string",
 *     "required": true,
 *     "description": "Unique weapon identifier to delete"
 *   }
 * }
 * @requestExample
 * {
 *   "query": {
 *     "weapon_id": "weapon_aklex"
 *   }
 * }
 * @response
 * {
 *   "200": {
 *     "success": true,
 *     "data": {
 *       "weaponId": "weapon_aklex",
 *       "name": "Aklex",
 *       "class": "Secondary"
 *     }
 *   },
 *   "200_null": {
 *     "success": true,
 *     "data": null
 *   },
 *   "400": {
 *     "success": false,
 *     "error": "weapon_id is required"
 *   },
 *   "500": {
 *     "success": false,
 *     "error": "Internal server error"
 *   }
 * }
 * @requires
 * - Database connection via dbService must be available
 * - weapons schema must define weaponId column
 * - Drizzle ORM eq() comparison must match schema field types
 */

import type { Request, Response } from "express"
import { eq } from "drizzle-orm"

import { db } from "@services/dbService"
import { weapons } from "@db/schema"

/**
 * DELETE /v1/warframe/weapons
 */
export default async function DELETE(req: Request, res: Response) {
    try {
        const weaponIdRaw = req.query.weapon_id
        const weaponId =
            typeof weaponIdRaw === "string"
                ? weaponIdRaw
                : Array.isArray(weaponIdRaw) &&
                typeof weaponIdRaw[0] === "string"
                    ? weaponIdRaw[0]
                    : undefined

        if (!weaponId) {
            return res.status(400).json({
                success: false,
                error: "weapon_id is required",
            })
        }

        const rows = await db
            .delete(weapons)
            .where(eq(weapons.weaponId, weaponId))
            .returning()

        const result = rows.length > 0 ? rows[0] : null

        return res.status(200).json({
            success: true,
            data: result,
        })
    } catch (err) {
        console.error("DELETE /weapons error:", err)

        return res.status(500).json({
            success: false,
            error: "Internal server error",
        })
    }
}
