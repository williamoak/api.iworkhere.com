/**
 * @myDocBlock v2.3
 * @file upsertWeapon
 * @external
 * @module warframe.weapons
 * @tag warframe.weapons
 * @version 1.0.3
 * @author william.r.oak@gmail.com
 * @path /v1/warframe/weapons
 * @summary Insert or update weapon records using identifier-driven resolution
 * @description
 * Performs conditional insert or update operations based on the presence of identifying fields
 * in the request body. The handler supports three mutually exclusive execution paths:
 *
 * 1. UPDATE by weapon_id:
 *    - Triggered when weapon_id is present
 *    - Validates using weaponUpdateSchema
 *    - Updates the matching record
 *    - Rejects if no writable fields are provided
 *
 * 2. RESOLVE by name (with optional class):
 *    - Triggered when name is present and weapon_id is absent
 *    - Default class is "normal" when not provided
 *    - Resolution logic:
 *        a. 0 matches → INSERT
 *        b. 1 match → UPDATE
 *        c. 2+ matches:
 *            - Filter by class
 *            - 0 matches → INSERT
 *            - 1 match → UPDATE
 *            - 2+ matches → 409 conflict (ambiguous)
 *
 * 3. INSERT:
 *    - Triggered when neither weapon_id nor name is provided
 *    - Validates using weaponInsertSchema
 *    - Inserts new record
 *
 * All writes use toWeaponWrite() for database normalization.
 * All responses map database rows through toWeaponDTO().
 *
 * Validation errors are enriched using overlayDto(), producing:
 * - details (zod issues)
 * - missing_fields (not provided in input)
 * - empty_fields (provided but empty or null)
 *
 * This endpoint is not a strict UPSERT; behavior depends on resolution rules and may insert new records.
 * @query
 * {}
 * @requestExample
 * {
 *   "update_by_id": {
 *     "weapon_id": "weapon_aklex",
 *     "description": "Updated description"
 *   },
 *   "resolve_by_name": {
 *     "name": "Aklex",
 *     "class": "secondary",
 *     "description": "Updated description"
 *   },
 *   "insert": {
 *     "name": "New Weapon",
 *     "class": "primary",
 *     "description": "New weapon description"
 *   }
 * }
 * @response
 * {
 *   "200": {
 *     "success": true,
 *     "data": {
 *       "weapon_id": "weapon_aklex",
 *       "name": "Aklex",
 *       "class": "secondary",
 *       "description": "Updated description"
 *     }
 *   },
 *   "200_null": {
 *     "success": true,
 *     "data": null
 *   },
 *   "400_validation": {
 *     "success": false,
 *     "error": "Validation failed",
 *     "details": [
 *       {
 *         "path": ["name"],
 *         "message": "Required"
 *       }
 *     ],
 *     "missing_fields": ["name"],
 *     "empty_fields": []
 *   },
 *   "400_empty_update": {
 *     "success": false,
 *     "error": "No fields provided to update"
 *   },
 *   "409": {
 *     "success": false,
 *     "error": "Multiple weapons match name and class"
 *   },
 *   "500": {
 *     "success": false,
 *     "error": "Internal server error"
 *   }
 * }
 * @requires
 * - Database connection via dbService must be available
 * - weapons schema must define weaponId, name, and class fields
 * - weaponInsertSchema, weaponUpdateSchema, weaponUpdateByNameSchema must be valid
 * - toWeaponWrite() must map validated input to database format
 * - toWeaponDTO() must map database rows to API response format
 * - overlayDto() and emptyWeapon must support validation enrichment
 */

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
