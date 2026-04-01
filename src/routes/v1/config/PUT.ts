/**
 * @myDocBlock v2.3
 * @file PUT.ts
 * @external
 * @module routes/v1/config
 * @tag config
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path /v1/config
 * @summary Create or update a configuration record.
 * @description
 * Creates or updates a configuration record identified by (name, version).
 * If a matching record exists, its value is updated in place. Otherwise,
 * a new record is inserted.
 *
 * @query
 *   {}
 *
 * @requestExample
 * {
 *   "name": "example",
 *   "version": "1.00",
 *   "value": {}
 * }
 *
 * @response
 * {
 *   "id": "uuid",
 *   "name": "example",
 *   "version": "1.00",
 *   "value": {},
 *   "createdAt": "ISO-8601",
 *   "updatedAt": "ISO-8601"
 * }
 *
 * @requires
 * {
 *   "tables": ["config"],
 *   "services": ["dbService"],
 *   "libraries": ["uuidv7"]
 * }
 */

import type { Request, Response } from 'express'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@services/dbService'
import { configTable } from '@db/schema/config'
import { uuidv7 } from 'uuidv7'

export const authRequired = true

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

export type ConfigRecord = {
    id: string
    name: string
    version: string
    value: unknown
    createdAt: Date
    updatedAt: Date
}

export interface ConfigWriteRepository {
    findByNameVersion(name: string, version: string): Promise<ConfigRecord | null>

    insert(record: {
        id: string
        name: string
        version: string
        value: unknown
    }): Promise<ConfigRecord>

    update(id: string, value: unknown): Promise<ConfigRecord>
}

/* ------------------------------------------------------------------ */
/* Validation                                                         */
/* ------------------------------------------------------------------ */

export const schema = {
    body: z.object({
        name: z.string().trim().min(1),
        version: z.string().trim().min(1),
        value: z.unknown(),
    }),
}

/* ------------------------------------------------------------------ */
/* Production repository (DB-backed)                                  */
/* ------------------------------------------------------------------ */

const dbConfigWriteRepository: ConfigWriteRepository = {
    async findByNameVersion(name, version) {
        const rows = await db
            .select({
                id: configTable.id,
                name: configTable.name,
                version: configTable.version,
                value: configTable.value,
                createdAt: configTable.createdAt,
                updatedAt: configTable.updatedAt,
            })
            .from(configTable)
            .where(and(eq(configTable.name, name), eq(configTable.version, version)))
            .limit(1)

        const row = rows[0]
        if (!row) return null

        return {
            id: row.id,
            name: row.name,
            version: String(row.version),
            value: row.value,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
        }
    },

    async insert(record) {
        await db.insert(configTable).values({
            id: record.id,
            name: record.name,
            version: record.version,
            value: record.value,
        })

        const rows = await db
            .select({
                id: configTable.id,
                name: configTable.name,
                version: configTable.version,
                value: configTable.value,
                createdAt: configTable.createdAt,
                updatedAt: configTable.updatedAt,
            })
            .from(configTable)
            .where(eq(configTable.id, record.id))
            .limit(1)

        const inserted = rows[0]
        if (!inserted) {
            throw new Error('Config insert failed: inserted row could not be reloaded')
        }

        return {
            id: inserted.id,
            name: inserted.name,
            version: String(inserted.version),
            value: inserted.value,
            createdAt: inserted.createdAt,
            updatedAt: inserted.updatedAt,
        }
    },

    async update(id, value) {
        await db
            .update(configTable)
            .set({
                value,
                updatedAt: new Date(),
            })
            .where(eq(configTable.id, id))

        const rows = await db
            .select({
                id: configTable.id,
                name: configTable.name,
                version: configTable.version,
                value: configTable.value,
                createdAt: configTable.createdAt,
                updatedAt: configTable.updatedAt,
            })
            .from(configTable)
            .where(eq(configTable.id, id))
            .limit(1)

        const updated = rows[0]
        if (!updated) {
            throw new Error('Config update failed: updated row could not be reloaded')
        }

        return {
            id: updated.id,
            name: updated.name,
            version: String(updated.version),
            value: updated.value,
            createdAt: updated.createdAt,
            updatedAt: updated.updatedAt,
        }
    },
}

/* ------------------------------------------------------------------ */
/* Core logic (unit-testable)                                          */
/* ------------------------------------------------------------------ */

export async function upsertConfig(
    repo: ConfigWriteRepository,
    params: {
        name: string
        version: string
        value: unknown
    }
): Promise<ConfigRecord> {
    const existing = await repo.findByNameVersion(params.name, params.version)

    if (existing) {
        return repo.update(existing.id, params.value)
    }

    return repo.insert({
        id: uuidv7(),
        name: params.name,
        version: params.version,
        value: params.value,
    })
}

/* ------------------------------------------------------------------ */
/* HTTP handler (thin wrapper)                                         */
/* ------------------------------------------------------------------ */

export default async function PUT(req: Request, res: Response) {
    const parsed = schema.body.safeParse(req.body)
    if (!parsed.success) {
        return res.status(400).json({
            error: 'INVALID_REQUEST',
            message: 'Invalid request body',
        })
    }

    const { name, version, value } = parsed.data

    try {
        const record = await upsertConfig(dbConfigWriteRepository, {
            name,
            version,
            value,
        })

        return res.status(200).json(record)
    } catch {
        return res.status(500).json({
            error: 'INTERNAL_ERROR',
            message: 'Failed to upsert config record',
        })
    }
}

/* ------------------------------------------------------------------ */
/* Test exports                                                       */
/* ------------------------------------------------------------------ */

export const __test__ = {
    upsertConfig,
}
