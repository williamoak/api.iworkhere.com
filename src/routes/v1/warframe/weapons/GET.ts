/**
 * @myDocBlock v2.3
 * @file GET.ts
 * @external
 * @module routes/v1/warframe/weapons
 * @tag warframe
 * @version 1.0.1
 * @author william.r.oak@gmail.com
 * @path /v1/warframe/weapons
 * @summary Retrieve weapon list and optionally resolve a single weapon.
 *
 * @description
 * Returns a stable response containing:
 * - A lightweight list of all weapons
 * - A single resolved weapon object
 *
 * Resolution order is:
 * 1) One or more weapon_id query parameters (first match wins)
 * 2) Exact name match
 *    - If multiple records share the same name, class is used
 *    - class defaults to "normal" when not provided
 * 3) No resolvable filters → empty weapon DTO
 *
 * This endpoint is read-only and has no side effects.
 *
 * @query
 * {
 *   "weapon_id": {
 *     "type": "string",
 *     "required": false,
 *     "description": "Weapon identifiers to resolve; first match wins (repeatable query param)"
 *   },
 *   "name": {
 *     "type": "string",
 *     "required": false,
 *     "description": "Exact weapon name to resolve"
 *   },
 *   "class": {
 *     "type": "string",
 *     "required": false,
 *     "description": "Weapon class used when resolving by name (defaults to normal)"
 *   }
 * }
 *
 * @requestExample
 * {
 *   "method": "GET",
 *   "url": "/v1/warframe/weapons?name=Braton&class=prime"
 * }
 *
 * @response
 * {
 *   "success": true,
 *   "data": {
 *     "weapons": [
 *       { "weapon_id": "<WEAPON_ID>", "name": "Braton" }
 *     ],
 *     "weapon": {}
 *   }
 * }
 *
 * @requires
 * {
 *   "tables": ["weapons"],
 *   "services": ["dbService"],
 *   "mappers": ["toWeaponDTO", "emptyWeapon"]
 * }
 */

import type { Request, Response } from "express";
import { inArray, eq } from "drizzle-orm";

import { db } from "@services/dbService";
import { weapons } from "@db/schema";
import { emptyWeapon, toWeaponDTO } from "@src/dto/weapon";

/**
 * GET /v1/warframe/weapons
 */
export default async function GET(req: Request, res: Response) {
    try {
        const weaponIdsRaw = req.query.weapon_id;
        const weaponIds =
            typeof weaponIdsRaw === "string"
                ? [weaponIdsRaw]
                : Array.isArray(weaponIdsRaw)
                    ? weaponIdsRaw.filter((v): v is string => typeof v === "string")
                    : [];

        const nameRaw = req.query.name;
        const name = typeof nameRaw === "string" ? nameRaw : undefined;

        const classRaw = req.query.class;
        const weaponClass = typeof classRaw === "string" ? classRaw : "normal";

        // --------------------------------------------------
        // 1) Always fetch lightweight weapon list
        // --------------------------------------------------
        const weaponList = await db
            .select({
                weapon_id: weapons.weaponId,
                name: weapons.name,
            })
            .from(weapons);

        // --------------------------------------------------
        // 2) Default active weapon
        // --------------------------------------------------
        let currentWeapon = emptyWeapon();

        // --------------------------------------------------
        // 3) Priority 1: weapon_id
        // --------------------------------------------------
        if (weaponIds.length > 0) {
            const rows = await db
                .select()
                .from(weapons)
                .where(inArray(weapons.weaponId, weaponIds));

            if (rows.length > 0) {
                currentWeapon = toWeaponDTO(rows[0]);
            }
        }

        // --------------------------------------------------
        // 4) Priority 2: name (+ class resolution)
        // --------------------------------------------------
        else if (name) {
            const nameMatches = await db
                .select()
                .from(weapons)
                .where(eq(weapons.name, name));

            // ---- 1 match → use it
            if (nameMatches.length === 1) {
                currentWeapon = toWeaponDTO(nameMatches[0]);
            }

            // ---- >1 matches → resolve by class
            else if (nameMatches.length > 1) {
                const narrowed = nameMatches.filter(
                    w => w.class === weaponClass
                );

                if (narrowed.length === 1) {
                    currentWeapon = toWeaponDTO(narrowed[0]);
                }
            }
        }

        return res.status(200).json({
            success: true,
            data: {
                weapons: weaponList,
                weapon: currentWeapon,
            },
        });
    } catch (err) {
        console.error("GET /weapons error:", err);

        return res.status(500).json({
            success: false,
            error: "Internal server error",
        });
    }
}
