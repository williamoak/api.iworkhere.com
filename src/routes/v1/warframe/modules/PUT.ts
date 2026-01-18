/**
 * @myDocBlock v2.2
 * @file PUT.ts
 * @external
 * @module warframe-modules
 * @tag modules
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path /v1/warframe/modules
 * @summary Insert or update a Warframe module.
 *
 * @description
 *   Performs a deterministic upsert-style operation on modules using
 *   the following resolution order:
 *
 *     1. Update by mod_id if provided
 *     2. Update by name if exactly one matching record exists
 *     3. Insert if name resolves to zero records
 *     4. Reject with conflict if name resolves to more than one record
 *
 *   If no mod_id or name is provided, the request is treated as an
 *   insert operation.
 *
 * @query
 *   {}
 *
 * @requestExample
 *   {
 *     "method": "PUT",
 *     "url": "/v1/warframe/modules",
 *     "body": {
 *       "name": "Vitality",
 *       "description": "Increases Warframe health.",
 *       "rarity": "common",
 *       "polarity": "vazarin",
 *       "rank_max": 10
 *     }
 *   }
 *
 * @response
 *   {
 *     "success": true,
 *     "data": {
 *       "mod_id": "550e8400-e29b-41d4-a716-446655440000",
 *       "name": "Vitality",
 *       "description": "Increases Warframe health.",
 *       "rarity": "common",
 *       "polarity": "vazarin",
 *       "rank_max": 10
 *     }
 *   }
 *
 * @requires
 *   - Database connection via dbService
 *   - modules table schema
 *   - Zod validation schemas:
 *       moduleInsertSchema
 *       moduleUpdateSchema
 *       moduleUpdateByNameSchema
 *   - DTO mapping via toModuleDTO()
 *   - Write mapper via toModuleWrite()
 */

import type { IncomingMessage, ServerResponse } from "http";
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

export default async function PUT(
    req: IncomingMessage,
    res: ServerResponse
) {
    const body = (req as any).body ?? {};

    try {
        let dbResult: any = null;

        // ---------------------------------
        // UPDATE by mod_id
        // ---------------------------------
        if (body?.mod_id) {
            const parsed = moduleUpdateSchema.parse(body);
            const writePayload = toModuleWrite(parsed);

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
                    res.statusCode = 400;
                    res.setHeader("Content-Type", "application/json");
                    res.end(JSON.stringify({
                        success: false,
                        error: "No fields provided to update",
                    }));
                    return;
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
                res.statusCode = 409;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({
                    success: false,
                    error: "Multiple modules match the given name",
                }));
                return;
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

        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({
            success: true,
            data: dbResult ? toModuleDTO(dbResult) : null,
        }));

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

        console.error("PUT /modules error:", err);
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({
            success: false,
            error: "Internal server error",
        }));
    }
}
