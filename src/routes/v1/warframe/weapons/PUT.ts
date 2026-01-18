/**
 * @myDocBlock v2.2
 * @file PUT.ts
 * @external
 * @module warframe-weapons
 * @tag weapons
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path /v1/warframe/weapons
 * @summary Insert or update a weapon.
 *
 * @description
 *   Performs a deterministic insert-or-update operation using the following
 *   resolution order:
 *
 *     1. Update by weapon_id if provided (highest priority)
 *     2. Resolve by name:
 *        - class defaults to "normal" if not provided
 *        - 0 name matches → insert
 *        - 1 name match → update
 *        - 2+ name matches → disambiguate by class
 *            - 0 narrowed → insert
 *            - 1 narrowed → update
 *            - >1 narrowed → reject with conflict
 *     3. Insert if no identifier is resolvable
 *
 *   Update operations require at least one writable field; otherwise the
 *   request is rejected.
 *
 * @query
 *   {}
 *
 * @requestExample
 *   {
 *     "method": "PUT",
 *     "url": "/v1/warframe/weapons",
 *     "body": {
 *       "name": "Braton",
 *       "class": "normal",
 *       "type": "rifle",
 *       "damage": 35
 *     }
 *   }
 *
 * @response
 *   {
 *     "success": true,
 *     "data": {
 *       "weapon_id": "880e8400-e29b-41d4-a716-446655440020",
 *       "name": "Braton",
 *       "class": "normal",
 *       "type": "rifle",
 *       "damage": 35
 *     }
 *   }
 *
 * @requires
 *   - Database connection via dbService
 *   - weapons table schema
 *   - Zod validation schemas:
 *       weaponInsertSchema
 *       weaponUpdateSchema
 *       weaponUpdateByNameSchema
 *   - DTO mapping via toWeaponDTO()
 *   - Write mapper via toWeaponWrite()
 *   - emptyWeapon() for validation overlay
 */

import type { IncomingMessage, ServerResponse } from "http";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { db } from "@services/dbService";
import { weapons } from "@db/schema";

import {
    weaponInsertSchema,
    weaponUpdateSchema,
    weaponUpdateByNameSchema,
} from "@src/validation/weapon";

import { toWeaponWrite } from "@src/db/mappers/weaponWrite";
import { toWeaponDTO, emptyWeapon } from "@src/dto/weapon";
import { overlayDto } from "@src/dto/dtoOverlay";

export default async function PUT(
    req: IncomingMessage,
    res: ServerResponse
) {
    const body = (req as any).body ?? {};

    try {
        let dbResult: any = null;

        // ---------------------------------
        // UPDATE by weapon_id
        // ---------------------------------
        if (body?.weapon_id) {
            const parsed = weaponUpdateSchema.parse(body);
            const writePayload = toWeaponWrite(parsed);

            if (Object.keys(writePayload).length === 0) {
                res.statusCode = 400;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({
                    success: false,
                    error: "No fields provided to update",
                }));
                return;
            }

            const rows = await db
                .update(weapons)
                .set(writePayload)
                .where(eq(weapons.weaponId, parsed.weapon_id))
                .returning();

            dbResult = rows[0] ?? null;
        }

            // ---------------------------------
            // UPDATE / INSERT by name
        // ---------------------------------
        else if (body?.name) {
            const parsed = weaponUpdateByNameSchema.parse(body);

            const resolvedClass = parsed.class ?? "normal";
            const effectiveParsed = {
                ...parsed,
                class: resolvedClass,
            };

            const nameMatches = await db
                .select()
                .from(weapons)
                .where(eq(weapons.name, effectiveParsed.name));

            // ---- 0 matches → INSERT
            if (nameMatches.length === 0) {
                const insertParsed = weaponInsertSchema.parse(effectiveParsed);
                const writePayload = toWeaponWrite(insertParsed);

                const rows = await db
                    .insert(weapons)
                    .values(writePayload)
                    .returning();

                dbResult = rows[0];
            }

            // ---- 1 match → UPDATE
            else if (nameMatches.length === 1) {
                const writePayload = toWeaponWrite(effectiveParsed);

                if (Object.keys(writePayload).length === 0) {
                    res.statusCode = 400;
                    res.setHeader("Content-Type", "application/json");
                    res.end(JSON.stringify({
                        success: false,
                        error: "No fields provided to update",
                    }));
                    return;
                }

                const rows = await db
                    .update(weapons)
                    .set(writePayload)
                    .where(eq(weapons.weaponId, nameMatches[0].weaponId))
                    .returning();

                dbResult = rows[0];
            }

            // ---- 2+ matches → disambiguate by class
            else {
                const narrowed = nameMatches.filter(
                    w => w.class === resolvedClass
                );

                if (narrowed.length === 0) {
                    const insertParsed =
                        weaponInsertSchema.parse(effectiveParsed);

                    const writePayload = toWeaponWrite(insertParsed);

                    const rows = await db
                        .insert(weapons)
                        .values(writePayload)
                        .returning();

                    dbResult = rows[0];
                } else if (narrowed.length === 1) {
                    const writePayload = toWeaponWrite(effectiveParsed);

                    if (Object.keys(writePayload).length === 0) {
                        res.statusCode = 400;
                        res.setHeader("Content-Type", "application/json");
                        res.end(JSON.stringify({
                            success: false,
                            error: "No fields provided to update",
                        }));
                        return;
                    }

                    const rows = await db
                        .update(weapons)
                        .set(writePayload)
                        .where(eq(weapons.weaponId, narrowed[0].weaponId))
                        .returning();

                    dbResult = rows[0];
                } else {
                    res.statusCode = 409;
                    res.setHeader("Content-Type", "application/json");
                    res.end(JSON.stringify({
                        success: false,
                        error: "Multiple weapons match name and class",
                    }));
                    return;
                }
            }
        }

            // ---------------------------------
            // INSERT (no identifiers)
        // ---------------------------------
        else {
            const parsed = weaponInsertSchema.parse(body);
            const writePayload = toWeaponWrite(parsed);

            const rows = await db
                .insert(weapons)
                .values(writePayload)
                .returning();

            dbResult = rows[0];
        }

        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({
            success: true,
            data: dbResult ? toWeaponDTO(dbResult) : null,
        }));

    } catch (err) {
        if (err instanceof z.ZodError) {
            const { merged, providedFields } = overlayDto(
                emptyWeapon,
                body ?? {}
            );

            const missing_fields = Object.keys(merged)
                .filter(key => !providedFields.has(key));

            const empty_fields = Object.entries(merged)
                .filter(([key, value]) =>
                    providedFields.has(key) &&
                    (value === "" || value === null)
                )
                .map(([key]) => key);

            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({
                success: false,
                error: "Validation failed",
                details: err.issues,
                missing_fields,
                empty_fields,
            }));
            return;
        }

        console.error("PUT /weapons error:", err);
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({
            success: false,
            error: "Internal server error",
        }));
    }
}
