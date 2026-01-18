/**
 * @myDocBlock v2.2
 * @file GET.ts
 * @external
 * @module warframe-weapons
 * @tag weapons
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path /v1/warframe/weapons
 * @summary Retrieve weapon list and optionally resolve a single weapon.
 *
 * @description
 *   Returns a stable response containing:
 *
 *   - A lightweight list of all weapons
 *   - A single resolved weapon object
 *
 *   Resolution order is:
 *     1. One or more weapon_id query parameters (first match wins)
 *     2. Exact name match
 *        - If multiple records share the same name, class is used
 *        - class defaults to "normal" when not provided
 *     3. No resolvable filters → empty weapon DTO
 *
 *   This endpoint is read-only and has no side effects.
 *
 * @query
 *   {
 *     "weapon_id": {
 *       "type": "string",
 *       "format": "uuid",
 *       "required": false,
 *       "multiple": true,
 *       "description": "Weapon identifiers to resolve; first match wins"
 *     },
 *     "name": {
 *       "type": "string",
 *       "required": false,
 *       "description": "Exact weapon name to resolve"
 *     },
 *     "class": {
 *       "type": "string",
 *       "required": false,
 *       "default": "normal",
 *       "description": "Weapon class used when resolving by name"
 *     }
 *   }
 *
 * @requestExample
 *   {
 *     "method": "GET",
 *     "url": "/v1/warframe/weapons?name=Braton&class=prime"
 *   }
 *
 * @response
 *   {
 *     "success": true,
 *     "data": {
 *       "weapons": [
 *         {
 *           "weapon_id": "880e8400-e29b-41d4-a716-446655440020",
 *           "name": "Braton"
 *         },
 *         {
 *           "weapon_id": "880e8400-e29b-41d4-a716-446655440021",
 *           "name": "Braton Prime"
 *         }
 *       ],
 *       "weapon": {
 *         "weapon_id": "880e8400-e29b-41d4-a716-446655440021",
 *         "name": "Braton",
 *         "class": "prime",
 *         "description": "",
 *         "weapon_mods": null
 *       }
 *     }
 *   }
 *
 * @requires
 *   - Database connection via dbService
 *   - weapons table schema
 *   - DTO mapping via toWeaponDTO()
 *   - emptyWeapon() for non-resolved responses
 */

import type { IncomingMessage, ServerResponse } from "http";
import { URL } from "url";

import { db } from "@services/dbService";
import { weapons } from "@db/schema";
import { inArray, eq } from "drizzle-orm";
import { emptyWeapon, toWeaponDTO } from "@src/dto/weapon";

/**
 * GET /v1/warframe/weapons
 *
 * Query params:
 *   - weapon_id (UUID)        optional, may appear multiple times
 *   - name (string)          optional, exact match
 *   - class (string)         optional, defaults to "normal" when name is used
 *
 * Response shape (always stable):
 * {
 *   weapons: [{ weapon_id, name }],
 *   weapon: { ...full weapon object (empty or populated) }
 * }
 */
export default async function GET(
    req: IncomingMessage,
    res: ServerResponse
) {
    try {
        const url = new URL(req.url ?? "", "http://localhost");

        const weaponIds = url.searchParams.getAll("weapon_id");
        const name = url.searchParams.get("name");
        const weaponClass = url.searchParams.get("class") ?? "normal";

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

        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(
            JSON.stringify({
                success: true,
                data: {
                    weapons: weaponList,
                    weapon: currentWeapon,
                },
            })
        );
    } catch (err) {
        console.error("GET /weapons error:", err);

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
