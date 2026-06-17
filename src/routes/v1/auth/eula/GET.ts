/**
 * @myDocBlock v2.3
 * @file GET.ts
 * @external
 * @module routes/v1/auth/eula
 * @tag auth, eula
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path /v1/auth/eula
 * @summary Fetch the current End User License Agreement (EULA).
 * @description
 * Returns the latest EULA document stored as a dedicated record in the config
 * table (name = "eula"). This endpoint is intentionally isolated from general
 * config querying: it does not accept query parameters and can only return the
 * latest EULA record.
 *
 * @requestExample
 * {}
 *
 * @response
 * 200:
 * {
 *   "name": "eula",
 *   "version": "1.00",
 *   "value": { ... },
 *   "updatedAt": "ISO-8601"
 * }
 * 404:
 * {
 *   "error": "EULA not found"
 * }
 *
 * @requires
 * {
 *   "tables": [
 *     "config"
 *   ],
 *   "services": [
 *     "dbService"
 *   ]
 * }
 */

import type { Request, Response } from 'express'
import { desc, eq } from 'drizzle-orm'

import { db } from '@services/dbService'
import { configTable } from '@db/schema/config'
import { markdownToHtml } from '@helpers/markdownToHtml'

const EULA_CONFIG_NAME = 'eula'

export type EulaRecord = {
    name: 'eula'
    version: string
    value: unknown
    updatedAt: Date
}

export interface EulaRepository {
    getLatest(): Promise<EulaRecord | null>
}

/**
 * If the stored value is:
 * - jsonb object: return as-is
 * - string containing JSON: parse it
 * - string but not JSON: return as-is
 */
function normalizeEulaValue(raw: unknown): unknown {
    if (typeof raw !== 'string') return raw

    const trimmed = raw.trim()
    if (!trimmed) return raw

    try {
        return JSON.parse(trimmed)
    } catch {
        return raw
    }
}

const dbEulaRepository: EulaRepository = {
    async getLatest() {
        const rows = await db
            .select({
                name: configTable.name,
                version: configTable.version,
                value: configTable.value,
                updatedAt: configTable.updatedAt,
            })
            .from(configTable)
            .where(eq(configTable.name, EULA_CONFIG_NAME))
            .orderBy(desc(configTable.version))
            .limit(1)

        const row = rows[0]
        if (!row) return null

        return {
            name: 'eula',
            version: String(row.version),
            value: normalizeEulaValue(row.value),
            updatedAt: row.updatedAt,
        }
    },
}

export async function fetchLatestEula(
    repo: EulaRepository
): Promise<EulaRecord | null> {
    const record = await repo.getLatest()
    if (!record) return null
    return {
        ...record,
        value: normalizeEulaValue(record.value)
    }
}

/**
 * Small seam so we can unit-test the HTTP behavior without DB.
 *
 * Important: normalize `value` here too, so *any* repo implementation
 * (including fake repos in unit tests) results in the same API contract.
 */
export function makeGetEulaHandler(repo: EulaRepository) {
    return async function GET(_req: Request, res: Response) {
        const record = await fetchLatestEula(repo)

        if (!record) {
            return res.status(404).json({
                error: 'EULA not found',
            })
        }

        const textContent = typeof record.value === 'object' && record.value !== null && 'text' in record.value
            ? String((record.value as any).text)
            : String(record.value)

        return res.status(200).json({
            name: record.name,
            version: record.version,
            value: markdownToHtml(textContent),
            lineCount: textContent.split('\n').length,
            updatedAt: record.updatedAt.toISOString(),
        })
    }
}

const GET = makeGetEulaHandler(dbEulaRepository)
export default GET

export const __test__ = {
    fetchLatestEula,
    makeGetEulaHandler,
}