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
