import type { Request, Response } from "express"
import { z } from "zod"
import { eq } from "drizzle-orm"

import { db } from "@services/dbService"
import { weapons } from "@db/schema"

import {
    weaponInsertSchema,
    weaponUpdateSchema,
    weaponUpdateByNameSchema,
} from "@src/validation/weapon"

import { toWeaponWrite } from "@src/db/mappers/weaponWrite"
import { toWeaponDTO, emptyWeapon } from "@src/dto/weapon"
import { overlayDto } from "@src/dto/dtoOverlay"

/**
 * PUT /v1/warframe/weapons
 */
export default async function PUT(req: Request, res: Response) {
    const body = req.body ?? {}

    try {
        let dbResult: any = null

        // --------------------------------------------------
        // UPDATE by weapon_id
        // --------------------------------------------------
        if (body?.weapon_id) {
            const parsed = weaponUpdateSchema.parse(body)
            const writePayload = toWeaponWrite(parsed)

            if (Object.keys(writePayload).length === 0) {
                return res.status(400).json({
                    success: false,
                    error: "No fields provided to update",
                })
            }

            const rows = await db
                .update(weapons)
                .set(writePayload)
                .where(eq(weapons.weaponId, parsed.weapon_id))
                .returning()

            dbResult = rows[0] ?? null
        }

            // --------------------------------------------------
            // UPDATE / INSERT by name
        // --------------------------------------------------
        else if (body?.name) {
            const parsed = weaponUpdateByNameSchema.parse(body)
            const resolvedClass = parsed.class ?? "normal"

            const effectiveParsed = {
                ...parsed,
                class: resolvedClass,
            }

            const nameMatches = await db
                .select()
                .from(weapons)
                .where(eq(weapons.name, effectiveParsed.name))

            // 0 matches → INSERT
            if (nameMatches.length === 0) {
                const insertParsed =
                    weaponInsertSchema.parse(effectiveParsed)

                const rows = await db
                    .insert(weapons)
                    .values(toWeaponWrite(insertParsed))
                    .returning()

                dbResult = rows[0]
            }

            // 1 match → UPDATE
            else if (nameMatches.length === 1) {
                const writePayload = toWeaponWrite(effectiveParsed)

                if (Object.keys(writePayload).length === 0) {
                    return res.status(400).json({
                        success: false,
                        error: "No fields provided to update",
                    })
                }

                const rows = await db
                    .update(weapons)
                    .set(writePayload)
                    .where(eq(weapons.weaponId, nameMatches[0].weaponId))
                    .returning()

                dbResult = rows[0]
            }

            // 2+ matches → disambiguate by class
            else {
                const narrowed = nameMatches.filter(
                    w => w.class === resolvedClass
                )

                if (narrowed.length === 0) {
                    const insertParsed =
                        weaponInsertSchema.parse(effectiveParsed)

                    const rows = await db
                        .insert(weapons)
                        .values(toWeaponWrite(insertParsed))
                        .returning()

                    dbResult = rows[0]
                } else if (narrowed.length === 1) {
                    const writePayload = toWeaponWrite(effectiveParsed)

                    if (Object.keys(writePayload).length === 0) {
                        return res.status(400).json({
                            success: false,
                            error: "No fields provided to update",
                        })
                    }

                    const rows = await db
                        .update(weapons)
                        .set(writePayload)
                        .where(eq(weapons.weaponId, narrowed[0].weaponId))
                        .returning()

                    dbResult = rows[0]
                } else {
                    return res.status(409).json({
                        success: false,
                        error: "Multiple weapons match name and class",
                    })
                }
            }
        }

            // --------------------------------------------------
            // INSERT (no identifiers)
        // --------------------------------------------------
        else {
            const parsed = weaponInsertSchema.parse(body)

            const rows = await db
                .insert(weapons)
                .values(toWeaponWrite(parsed))
                .returning()

            dbResult = rows[0]
        }

        return res.status(200).json({
            success: true,
            data: dbResult ? toWeaponDTO(dbResult) : null,
        })

    } catch (err) {
        if (err instanceof z.ZodError) {
            const { merged, providedFields } = overlayDto(
                emptyWeapon,
                body ?? {}
            )

            const missing_fields = Object.keys(merged)
                .filter(k => !providedFields.has(k))

            const empty_fields = Object.entries(merged)
                .filter(([k, v]) =>
                    providedFields.has(k) && (v === "" || v === null)
                )
                .map(([k]) => k)

            return res.status(400).json({
                success: false,
                error: "Validation failed",
                details: err.issues,
                missing_fields,
                empty_fields,
            })
        }

        console.error("PUT /weapons error:", err)
        return res.status(500).json({
            success: false,
            error: "Internal server error",
        })
    }
}
