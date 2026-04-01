/**
 * @myDocBlock v2.3
 * @file GET.ts
 * @external
 * @module routes/v1/config
 * @tag config
 * @version 1.1.0
 * @author william.r.oak@gmail.com
 * @path /v1/config
 * @summary Fetch configuration records.
 *
 * @description
 * Deterministic, identifier-based retrieval of configuration records.
 *
 * Resolution order:
 *   1) id — fetch exact record by UUID
 *   2) name + version — fetch exact record
 *   3) name only — fetch ONLY if exactly one record exists
 *   4) no query params — return all records
 *
 * Invalid or ambiguous queries are rejected with explicit errors.
 *
 * @query
 * {
 *   "id": {
 *     "type": "string",
 *     "required": false,
 *     "description": "Exact UUID of the config record"
 *   },
 *   "name": {
 *     "type": "string",
 *     "required": false,
 *     "description": "Configuration key name"
 *   },
 *   "version": {
 *     "type": "string",
 *     "required": false,
 *     "description": "Exact configuration version"
 *   }
 * }
 *
 * @response
 * {
 *   "id": "uuid",
 *   "name": "example",
 *   "version": "1.03",
 *   "value": {},
 *   "createdAt": "ISO-8601",
 *   "updatedAt": "ISO-8601"
 * }
 *
 * @requires
 * {
 *   "tables": ["config"],
 *   "services": ["dbService"]
 * }
 */

import type { Request, Response } from 'express'
import { and, asc, eq } from 'drizzle-orm'

import { db } from '@services/dbService'
import { configTable } from '@db/schema/config'

export const authRequired = true

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function normalize(param: unknown): string | undefined {
    if (typeof param !== 'string') return undefined
    const trimmed = param.trim()
    return trimmed.length > 0 ? trimmed : undefined
}

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

export interface ConfigRepository {
    getById(id: string): Promise<ConfigRecord | null>
    findByName(name: string): Promise<ConfigRecord[]>
    findByNameAndVersion(
        name: string,
        version: string
    ): Promise<ConfigRecord[]>
    getAll(): Promise<ConfigRecord[]>
}

/* ------------------------------------------------------------------ */
/* Production repository                                              */
/* ------------------------------------------------------------------ */

const dbConfigRepository: ConfigRepository = {
    async getById(id: string) {
        const rows = await db
            .select()
            .from(configTable)
            .where(eq(configTable.id, id))
            .limit(1)

        return rows.length === 1
            ? {
                id: rows[0].id,
                name: rows[0].name,
                version: String(rows[0].version),
                value: rows[0].value,
                createdAt: rows[0].createdAt,
                updatedAt: rows[0].updatedAt,
            }
            : null
    },

    async findByName(name: string) {
        const rows = await db
            .select()
            .from(configTable)
            .where(eq(configTable.name, name))
            .orderBy(asc(configTable.version))

        return rows.map((row) => ({
            id: row.id,
            name: row.name,
            version: String(row.version),
            value: row.value,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
        }))
    },

    async findByNameAndVersion(name: string, version: string) {
        const rows = await db
            .select()
            .from(configTable)
            .where(
                and(
                    eq(configTable.name, name),
                    eq(configTable.version, version)
                )
            )
            .limit(2)

        return rows.map((row) => ({
            id: row.id,
            name: row.name,
            version: String(row.version),
            value: row.value,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
        }))
    },

    async getAll() {
        const rows = await db
            .select()
            .from(configTable)
            .orderBy(asc(configTable.name), asc(configTable.version))

        return rows.map((row) => ({
            id: row.id,
            name: row.name,
            version: String(row.version),
            value: row.value,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
        }))
    },
}

/* ------------------------------------------------------------------ */
/* HTTP handler                                                       */
/* ------------------------------------------------------------------ */

export default async function GET(req: Request, res: Response) {
    const id = normalize(req.query.id)
    const name = normalize(req.query.name)
    const version = normalize(req.query.version)

    /* --------------------------------------------------------------
     * Guard rails (invalid combinations)
     * -------------------------------------------------------------- */

    if (version && !name) {
        return res.status(400).json({
            error: 'INVALID_REQUEST',
            message: 'version cannot be used without name',
        })
    }

    if (id && (name || version)) {
        return res.status(400).json({
            error: 'INVALID_REQUEST',
            message: 'id cannot be combined with name or version',
        })
    }

    /* --------------------------------------------------------------
     * 1) Fetch by id
     * -------------------------------------------------------------- */

    if (id) {
        const record = await dbConfigRepository.getById(id)

        if (!record) {
            return res.status(404).json({
                error: 'NOT_FOUND',
                message: 'Config record not found',
            })
        }

        return res.status(200).json(record)
    }

    /* --------------------------------------------------------------
     * 2) Fetch by name + version
     * -------------------------------------------------------------- */

    if (name && version) {
        const matches =
            await dbConfigRepository.findByNameAndVersion(
                name,
                version
            )

        if (matches.length === 0) {
            return res.status(404).json({
                error: 'NOT_FOUND',
                message: 'No config record matches name and version',
            })
        }

        if (matches.length > 1) {
            return res.status(409).json({
                error: 'CONFLICT',
                message:
                    'Multiple config records match name and version',
            })
        }

        return res.status(200).json(matches[0])
    }

    /* --------------------------------------------------------------
     * 3) Fetch by name only (must be unique)
     * -------------------------------------------------------------- */

    if (name) {
        const matches = await dbConfigRepository.findByName(name)

        if (matches.length === 0) {
            return res.status(404).json({
                error: 'NOT_FOUND',
                message: 'Config record not found',
            })
        }

        if (matches.length > 1) {
            return res.status(409).json({
                error: 'CONFLICT',
                message:
                    'Multiple config records exist for this name; specify version',
            })
        }

        return res.status(200).json(matches[0])
    }

    /* --------------------------------------------------------------
     * 4) No filters — return all
     * -------------------------------------------------------------- */

    const all = await dbConfigRepository.getAll()
    return res.status(200).json(all)
}

/* ------------------------------------------------------------------ */
/* Test hooks                                                         */
/* ------------------------------------------------------------------ */

export const __test__ = {
    dbConfigRepository,
}
