/**
 * @myDocBlock v2.2
 * @file PUT.ts
 * @external
 * @module warframe-warframes
 * @tag warframes
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path /v1/warframe/warframes
 * @summary Insert or update a warframe.
 *
 * @description
 *   Performs a deterministic insert-or-update operation using the following
 *   resolution order:
 *
 *     1. Update by warframe_id if provided (highest priority)
 *     2. Resolve by name:
 *        - class defaults to "normal" if not provided
 *        - 0 matches → insert
 *        - 1 match → update
 *        - 2+ matches → disambiguate by resolved class
 *     3. Insert if no identifier is resolvable
 *
 *   If multiple records still match after class disambiguation, the request
 *   is rejected with a conflict error.
 *
 * @query
 *   {}
 *
 * @requestExample
 *   {
 *     "method": "PUT",
 *     "url": "/v1/warframe/warframes",
 *     "body": {
 *       "name": "Excalibur",
 *       "class": "normal",
 *       "health": 100,
 *       "shield": 100,
 *       "armor": 225,
 *       "energy": 100
 *     }
 *   }
 *
 * @response
 *   {
 *     "success": true,
 *     "data": {
 *       "warframe_id": "660e8400-e29b-41d4-a716-446655440010",
 *       "name": "Excalibur",
 *       "class": "normal",
 *       "health": 100,
 *       "shield": 100,
 *       "armor": 225,
 *       "energy": 100
 *     }
 *   }
 *
 * @requires
 *   - Database connection via dbService
 *   - warframe table schema
 *   - Zod validation schemas:
 *       warframeInsertSchema
 *       warframeUpdateSchema
 *       warframeUpdateByNameSchema
 *   - DTO mapping via toWarframeDTO()
 *   - Write mapper via toWarframeWrite()
 *   - emptyWarframe() for validation overlay
 */

import type { IncomingMessage, ServerResponse } from "http";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { db } from "@services/dbService";
import { warframe } from "@db/schema";

import {
    warframeInsertSchema,
    warframeUpdateSchema,
    warframeUpdateByNameSchema,
} from "@src/validation/warframe";

import { toWarframeDTO, emptyWarframe } from "@src/dto/warframe";
import { overlayDto } from "@src/dto/dtoOverlay";
import { toWarframeWrite } from "@src/db/mappers/warframeWrite";

export default async function PUT(
    req: IncomingMessage,
    res: ServerResponse
) {
    const body = (req as any).body ?? {};

    try {
        let dbResult: any = null;

        // -------------------------------------------------
        // UPDATE by warframe_id (absolute)
        // -------------------------------------------------
        if (body?.warframe_id) {
            const parsed = warframeUpdateSchema.parse(body);
            const writePayload = toWarframeWrite(parsed);

            const rows = await db
                .update(warframe)
                .set(writePayload)
                .where(eq(warframe.warframeId, parsed.warframe_id))
                .returning();

            dbResult = rows[0] ?? null;
        }

            // -------------------------------------------------
            // UPDATE / INSERT by name (class defaults applied)
        // -------------------------------------------------
        else if (body?.name) {
            const parsed = warframeUpdateByNameSchema.parse(body);

            // ✅ class ALWAYS defaults here for name-based logic
            const resolvedClass = parsed.class ?? "normal";

            const effectiveParsed = {
                ...parsed,
                class: resolvedClass,
            };

            const nameMatches = await db
                .select()
                .from(warframe)
                .where(eq(warframe.name, effectiveParsed.name));

            // ---- 0 matches → INSERT
            if (nameMatches.length === 0) {
                const insertParsed = warframeInsertSchema.parse(effectiveParsed);
                const writePayload = toWarframeWrite(insertParsed);

                const rows = await db
                    .insert(warframe)
                    .values(writePayload)
                    .returning();

                dbResult = rows[0];
            }

            // ---- 1 match → UPDATE (with defaulted class)
            else if (nameMatches.length === 1) {
                const writePayload = toWarframeWrite(effectiveParsed);

                const rows = await db
                    .update(warframe)
                    .set(writePayload)
                    .where(eq(warframe.warframeId, nameMatches[0].warframeId))
                    .returning();

                dbResult = rows[0];
            }

            // ---- 2+ matches → disambiguate by class
            else {
                const narrowed = nameMatches.filter(
                    w => w.class === resolvedClass
                );

                // 0 narrowed matches → INSERT
                if (narrowed.length === 0) {
                    const insertParsed =
                        warframeInsertSchema.parse(effectiveParsed);

                    const writePayload = toWarframeWrite(insertParsed);

                    const rows = await db
                        .insert(warframe)
                        .values(writePayload)
                        .returning();

                    dbResult = rows[0];
                }

                // 1 narrowed match → UPDATE
                else if (narrowed.length === 1) {
                    const writePayload = toWarframeWrite(effectiveParsed);

                    const rows = await db
                        .update(warframe)
                        .set(writePayload)
                        .where(eq(warframe.warframeId, narrowed[0].warframeId))
                        .returning();

                    dbResult = rows[0];
                }

                // >1 narrowed matches → conflict
                else {
                    res.statusCode = 409;
                    res.setHeader("Content-Type", "application/json");
                    res.end(JSON.stringify({
                        success: false,
                        error: "Multiple warframes match name and class",
                    }));
                    return;
                }
            }
        }

            // -------------------------------------------------
            // INSERT (no identifiers)
        // -------------------------------------------------
        else {
            const parsed = warframeInsertSchema.parse(body);
            const writePayload = toWarframeWrite(parsed);

            const rows = await db
                .insert(warframe)
                .values(writePayload)
                .returning();

            dbResult = rows[0];
        }

        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({
            success: true,
            data: dbResult ? toWarframeDTO(dbResult) : null,
        }));

    } catch (err) {
        if (err instanceof z.ZodError) {
            const { merged, providedFields } = overlayDto(
                emptyWarframe,
                body ?? {}
            );

            const missing_fields = Object.keys(merged)
                .filter(k => !providedFields.has(k));

            const empty_fields = Object.entries(merged)
                .filter(([k, v]) =>
                    providedFields.has(k) && (v === "" || v === null)
                )
                .map(([k]) => k);

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

        console.error("PUT /warframes error:", err);
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({
            success: false,
            error: "Internal server error",
        }));
    }
}
