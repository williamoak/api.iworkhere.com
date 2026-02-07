/**
 * @myDocBlock v2.3
 * @file PUT.ts
 * @external
 * @module routes/v1/warframe/modules
 * @tag warframe
 * @version 1.0.1
 * @author william.r.oak@gmail.com
 * @path /v1/warframe/modules
 * @summary Insert or update a Warframe module.
 *
 * @description
 * Performs a deterministic upsert-style operation on modules using
 * the following resolution order:
 *
 * 1. Update by mod_id if provided
 * 2. Update by name if exactly one matching record exists
 * 3. Insert if name resolves to zero records
 * 4. Reject with conflict if name resolves to more than one record
 *
 * If no mod_id or name is provided, the request is treated as an insert operation.
 *
 * @query none
 *
 * @requestExample
 * {
 *   "mod_id": "<MOD_ID>",
 *   "name": "Vitality",
 *   "description": "Increases Warframe health.",
 *   "rarity": "common",
 *   "polarity": "vazarin",
 *   "rank_max": 10
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
 *   "services": ["dbService"],
 *   "validation": ["moduleInsertSchema", "moduleUpdateSchema", "moduleUpdateByNameSchema"],
 *   "mappers": ["toModuleDTO", "toModuleWrite"]
 * }
 */

import type { Request, Response } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { db } from "@services/dbService";
import { modules } from "@db/schema";

import {
    moduleInsertSchema,
    moduleUpdateSchema,
    moduleUpdateByNameSchema,
} from "@src/validation/module";

import { toModuleWrite } from "@src/db/mappers/moduleWrite";
import { toModuleDTO, emptyModule } from "@src/dto/module";
import { overlayDto } from "@src/dto/dtoOverlay";

export default async function PUT(req: Request, res: Response) {
    const body = req.body ?? {};

    try {
        let dbResult: any = null;

        // ---------------------------------
        // UPDATE by mod_id
        // ---------------------------------
        if (body?.mod_id) {
            const parsed = moduleUpdateSchema.parse(body);
            const writePayload = toModuleWrite(parsed);

            if (Object.keys(writePayload).length === 0) {
                return res.status(400).json({
                    success: false,
                    error: "No fields provided to update",
                });
            }

            const rows = await db
                .update(modules)
                .set(writePayload)
                .where(eq(modules.modId, parsed.mod_id))
                .returning();

            dbResult = rows[0] ?? null;
        }

        // ---------------------------------
        // UPDATE / INSERT by name
        // ---------------------------------
        else if (body?.name) {
            const parsed = moduleUpdateByNameSchema.parse(body);

            const matches = await db
                .select()
                .from(modules)
                .where(eq(modules.name, parsed.name));

            // ---- 0 matches → INSERT
            if (matches.length === 0) {
                const insertParsed = moduleInsertSchema.parse(parsed);
                const writePayload = toModuleWrite(insertParsed);

                const rows = await db
                    .insert(modules)
                    .values(writePayload)
                    .returning();

                dbResult = rows[0];
            }

            // ---- 1 match → UPDATE
            else if (matches.length === 1) {
                const writePayload = toModuleWrite(parsed);

                if (Object.keys(writePayload).length === 0) {
                    return res.status(400).json({
                        success: false,
                        error: "No fields provided to update",
                    });
                }

                const rows = await db
                    .update(modules)
                    .set(writePayload)
                    .where(eq(modules.modId, matches[0].modId))
                    .returning();

                dbResult = rows[0];
            }

            // ---- >1 matches → error
            else {
                return res.status(409).json({
                    success: false,
                    error: "Multiple modules match the given name",
                });
            }
        }

        // ---------------------------------
        // INSERT (fallback)
        // ---------------------------------
        else {
            const parsed = moduleInsertSchema.parse(body);
            const writePayload = toModuleWrite(parsed);

            const rows = await db
                .insert(modules)
                .values(writePayload)
                .returning();

            dbResult = rows[0];
        }

        return res.status(200).json({
            success: true,
            data: dbResult ? toModuleDTO(dbResult) : null,
        });

    } catch (err) {
        if (err instanceof z.ZodError) {
            const { merged, providedFields } = overlayDto(
                emptyModule,
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

            return res.status(400).json({
                success: false,
                error: "Validation failed",
                details: err.issues,
                missing_fields,
                empty_fields,
            });
        }

        console.error("PUT /modules error:", err);
        return res.status(500).json({
            success: false,
            error: "Internal server error",
        });
    }
}
