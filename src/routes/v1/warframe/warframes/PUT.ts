/**
 * @myDocBlock v2.3
 * @file PUT.ts
 * @external
 @module warframe.warframes
 * @tag warframe.warframes
 * @version 1.0.1
 * @author william.r.oak@gmail.com
 * @path /v1/warframe/warframes
 * @summary Insert or update a warframe.
 * @description
 * Performs a deterministic insert-or-update operation using the following
 * resolution order:
 *
 * 1. Update by warframe_id if provided (highest priority)
 * 2. Resolve by name:
 *    - class defaults to "normal" if not provided
 *    - 0 matches → insert
 *    - 1 match → update
 *    - 2+ matches → disambiguate by resolved class
 * 3. Insert if no identifier is resolvable
 *
 * If multiple records still match after class disambiguation, the request
 * is rejected with a conflict error.
 *
 * @query none
 *
 * @requestExample
 * {
 *   "warframe_id": "<WARFRAME_ID>",
 *   "name": "Excalibur",
 *   "class": "normal"
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
 *   "tables": ["warframes"],
 *   "services": ["dbService"],
 *   "validation": ["warframeInsertSchema", "warframeUpdateSchema", "warframeUpdateByNameSchema"],
 *   "mappers": ["toWarframeDTO", "toWarframeWrite"]
 * }
 */

import type { Request, Response } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { db } from "@services/dbService";
import { warframes } from "@db/schema";

import {
    warframeInsertSchema,
    warframeUpdateSchema,
    warframeUpdateByNameSchema,
} from "@src/validation/warframe";

import { toWarframeDTO, emptyWarframe } from "@src/dto/warframe";
import { overlayDto } from "@src/dto/dtoOverlay";
import { toWarframeWrite } from "@src/db/mappers/warframeWrite";

export default async function PUT(req: Request, res: Response) {
    const body = req.body ?? {};

    try {
        let dbResult: any = null;

        // -------------------------------------------------
        // UPDATE by warframe_id (absolute)
        // -------------------------------------------------
        if (body?.warframe_id) {
            const parsed = warframeUpdateSchema.parse(body);
            const writePayload = toWarframeWrite(parsed);

            const rows = await db
                .update(warframes)
                .set(writePayload)
                .where(eq(warframes.warframeId, parsed.warframe_id))
                .returning();

            dbResult = rows[0] ?? null;
        }

        // -------------------------------------------------
        // UPDATE / INSERT by name (class defaults applied)
        // -------------------------------------------------
        else if (body?.name) {
            const parsed = warframeUpdateByNameSchema.parse(body);

            // class ALWAYS defaults here for name-based logic
            const resolvedClass = parsed.class ?? "normal";

            const effectiveParsed = {
                ...parsed,
                class: resolvedClass,
            };

            const nameMatches = await db
                .select()
                .from(warframes)
                .where(eq(warframes.name, effectiveParsed.name));

            // ---- 0 matches → INSERT
            if (nameMatches.length === 0) {
                const insertParsed = warframeInsertSchema.parse(effectiveParsed);
                const writePayload = toWarframeWrite(insertParsed);

                const rows = await db
                    .insert(warframes)
                    .values(writePayload)
                    .returning();

                dbResult = rows[0];
            }

            // ---- 1 match → UPDATE (with defaulted class)
            else if (nameMatches.length === 1) {
                const writePayload = toWarframeWrite(effectiveParsed);

                const rows = await db
                    .update(warframes)
                    .set(writePayload)
                    .where(eq(warframes.warframeId, nameMatches[0].warframeId))
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
                        .insert(warframes)
                        .values(writePayload)
                        .returning();

                    dbResult = rows[0];
                }

                // 1 narrowed match → UPDATE
                else if (narrowed.length === 1) {
                    const writePayload = toWarframeWrite(effectiveParsed);

                    const rows = await db
                        .update(warframes)
                        .set(writePayload)
                        .where(eq(warframes.warframeId, narrowed[0].warframeId))
                        .returning();

                    dbResult = rows[0];
                }

                // >1 narrowed matches → conflict
                else {
                    return res.status(409).json({
                        success: false,
                        error: "Multiple warframes match name and class",
                    });
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
                .insert(warframes)
                .values(writePayload)
                .returning();

            dbResult = rows[0];
        }

        return res.status(200).json({
            success: true,
            data: dbResult ? toWarframeDTO(dbResult) : null,
        });

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

            return res.status(400).json({
                success: false,
                error: "Validation failed",
                details: err.issues,
                missing_fields,
                empty_fields,
            });
        }

        console.error("PUT /warframes error:", err);
        return res.status(500).json({
            success: false,
            error: "Internal server error",
        });
    }
}
