/**
 * @myDocBlock v2.3
 * @file DELETE.ts
 * @external
 * @module routes/v1/config
 * @tag config
 * @version 1.1.0
 * @author william.r.oak@gmail.com
 * @path /v1/config
 * @summary Delete a configuration record.
 *
 * @description
 * Deletes a configuration record using one of the following deterministic
 * resolution strategies (highest priority first):
 *
 * 1) uuid — deletes the exact record by UUID
 * 2) name + version — deletes the exact matching record
 * 3) name only — deletes the record ONLY if exactly one record exists
 *
 * Ambiguous deletes are rejected with 409 CONFLICT.
 * Missing or invalid query combinations are rejected with 400.
 *
 * This is an administrative endpoint and must be access-controlled
 * by middleware at the routing layer.
 *
 * @query
 * {
 *   "uuid": {
 *     "type": "string",
 *     "required": false,
 *     "description": "Exact UUID of the config record to delete"
 *   },
 *   "name": {
 *     "type": "string",
 *     "required": false,
 *     "description": "Config name (used only if uuid not provided)"
 *   },
 *   "version": {
 *     "type": "string",
 *     "required": false,
 *     "description": "Config version (optional disambiguator for name)"
 *   }
 * }
 *
 * @response
 * {
 *   "success": true
 * }
 *
 * @requires
 * {
 *   "tables": ["config"],
 *   "services": ["dbService"]
 * }
 */

import type { Request, Response } from "express"
import { z } from "zod"
import { eq, and } from "drizzle-orm"

import { db } from "@services/dbService"
import { configTable } from "@db/schema/config"

export const authRequired = true

/* ------------------------------------------------------------------ */
/* Validation                                                         */
/* ------------------------------------------------------------------ */
const UUID_V7_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export const schema = {
    query: z.object({
        uuid: z
            .string()
            .trim()
            .refine(
                v => UUID_V7_REGEX.test(v),
                { message: "Invalid UUIDv7" }
            )
            .optional(),

        name: z.string().trim().min(1).optional(),
        version: z.string().trim().min(1).optional(),
    }),
}

/* ------------------------------------------------------------------ */
/* Repository                                                         */
/* ------------------------------------------------------------------ */

export interface ConfigDeleteRepository {
    deleteById(id: string): Promise<boolean>
    findByName(name: string): Promise<{ id: string }[]>
    findByNameAndVersion(
        name: string,
        version: string
    ): Promise<{ id: string }[]>
}

const dbConfigDeleteRepository: ConfigDeleteRepository = {
    async deleteById(id: string): Promise<boolean> {
        const rows = await db
            .delete(configTable)
            .where(eq(configTable.id, id))
            .returning({ id: configTable.id })

        return rows.length === 1
    },

    async findByName(name: string): Promise<{ id: string }[]> {
        return db
            .select({ id: configTable.id })
            .from(configTable)
            .where(eq(configTable.name, name))
    },

    async findByNameAndVersion(
        name: string,
        version: string
    ): Promise<{ id: string }[]> {
        return db
            .select({ id: configTable.id })
            .from(configTable)
            .where(
                and(
                    eq(configTable.name, name),
                    eq(configTable.version, version)
                )
            )
    },
}

/* ------------------------------------------------------------------ */
/* Handler                                                            */
/* ------------------------------------------------------------------ */

export default async function DELETE(req: Request, res: Response) {
    const query =
        (req.validated?.query as {
            uuid?: string
            name?: string
            version?: string
        }) ?? {}

    const { uuid, name, version } = query

    /* --------------------------------------------------------------
     * Guard rails
     * -------------------------------------------------------------- */

    if (uuid && (name || version)) {
        return res.status(400).json({
            error: "INVALID_REQUEST",
            message: "uuid cannot be combined with name or version",
        })
    }

    if (version && !name) {
        return res.status(400).json({
            error: "INVALID_REQUEST",
            message: "version requires name",
        })
    }

    try {
        /* ----------------------------------------------------------
         * 1) Delete by UUID
         * ---------------------------------------------------------- */

        if (uuid) {
            const ok = await dbConfigDeleteRepository.deleteById(uuid)

            if (!ok) {
                return res.status(404).json({
                    error: "NOT_FOUND",
                    message: "Config record not found",
                })
            }

            return res.status(200).json({ success: true })
        }

        /* ----------------------------------------------------------
         * 2) Delete by name + version
         * ---------------------------------------------------------- */

        if (name && version) {
            const matches =
                await dbConfigDeleteRepository.findByNameAndVersion(
                    name,
                    version
                )

            if (matches.length === 0) {
                return res.status(404).json({
                    error: "NOT_FOUND",
                    message: "Config record not found",
                })
            }

            if (matches.length > 1) {
                return res.status(409).json({
                    error: "CONFLICT",
                    message:
                        "Multiple config records match name and version",
                })
            }

            await dbConfigDeleteRepository.deleteById(matches[0].id)
            return res.status(200).json({ success: true })
        }

        /* ----------------------------------------------------------
         * 3) Delete by name only (must be unique)
         * ---------------------------------------------------------- */

        if (name) {
            const matches =
                await dbConfigDeleteRepository.findByName(name)

            if (matches.length === 0) {
                return res.status(404).json({
                    error: "NOT_FOUND",
                    message: "Config record not found",
                })
            }

            if (matches.length > 1) {
                return res.status(409).json({
                    error: "CONFLICT",
                    message:
                        "Multiple config records exist for this name; specify version",
                })
            }

            await dbConfigDeleteRepository.deleteById(matches[0].id)
            return res.status(200).json({ success: true })
        }

        /* ----------------------------------------------------------
         * No valid identifier supplied
         * ---------------------------------------------------------- */

        return res.status(400).json({
            error: "INVALID_REQUEST",
            message: "uuid or name is required",
        })
    } catch (err) {
        console.error("DELETE /config error:", err)

        return res.status(500).json({
            error: "INTERNAL_ERROR",
            message: "Failed to delete config record",
        })
    }
}

/* ------------------------------------------------------------------ */
/* Test Hooks                                                         */
/* ------------------------------------------------------------------ */

export const __test__ = {
    schema,
    dbConfigDeleteRepository,
}
