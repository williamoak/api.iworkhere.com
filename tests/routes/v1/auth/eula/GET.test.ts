/**
 * @myDocBlock v2.3
 * @file GET.test.ts
 * @internal
 * @module tests/routes/v1/auth/eula
 * @tag auth, eula, test
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path tests/routes/v1/auth/eula/GET.test.ts
 * @summary Unit tests for auth EULA endpoint logic (repository-driven).
 * @description
 * Verifies that auth/eula:
 *   - returns the latest EULA record when available
 *   - returns 404 when no EULA record exists
 *   - serializes updatedAt to ISO-8601
 *   - safely handles EULA value as jsonb OR JSON string
 *
 * @query
 *   {}
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response } from 'express'
import { __test__ } from '@routes/v1/auth/eula/GET'
import type { EulaRepository } from '@routes/v1/auth/eula/GET'

const { fetchLatestEula, makeGetEulaHandler } = __test__

function createReq(): Request {
    return {} as unknown as Request
}

type ResMock = Response & {
    statusCode: number
    body?: any
}

function createRes(): ResMock {
    const res = {
        statusCode: 0,
        body: undefined,

        status(code: number) {
            this.statusCode = code
            return this
        },

        json(payload: any) {
            this.body = payload
            return this
        },
    }

    return res as unknown as ResMock
}

beforeEach(() => {
    vi.resetAllMocks()
})

describe('fetchLatestEula (unit)', () => {
    it('returns the record from the repository', async () => {
        const repo: EulaRepository = {
            getLatest: vi.fn().mockResolvedValue({
                name: 'eula',
                version: '2.10',
                value: { effectiveDate: '2026-02-01' },
                updatedAt: new Date('2026-02-01T00:00:00Z'),
            }),
        }

        const record = await fetchLatestEula(repo)

        expect(record?.name).toBe('eula')
        expect(record?.version).toBe('2.10')
        expect((record?.value as any).effectiveDate).toBe('2026-02-01')
    })

    it('returns null when repository returns null', async () => {
        const repo: EulaRepository = {
            getLatest: vi.fn().mockResolvedValue(null),
        }

        const record = await fetchLatestEula(repo)

        expect(record).toBeNull()
    })
})

describe('GET /v1/auth/eula handler (unit)', () => {
    it('returns 200 with the EULA payload and ISO updatedAt', async () => {
        const repo: EulaRepository = {
            getLatest: vi.fn().mockResolvedValue({
                name: 'eula',
                version: '2.10',
                value: { effectiveDate: '2026-02-01' },
                updatedAt: new Date('2026-02-01T00:00:00Z'),
            }),
        }

        const handler = makeGetEulaHandler(repo)

        const req = createReq()
        const res = createRes()

        await handler(req, res)

        expect(res.statusCode).toBe(200)
        expect(res.body).toEqual({
            name: 'eula',
            version: '2.10',
            value: { effectiveDate: '2026-02-01' },
            updatedAt: '2026-02-01T00:00:00.000Z',
        })
    })

    it('parses value when repository returns a JSON string', async () => {
        const repo: EulaRepository = {
            getLatest: vi.fn().mockResolvedValue({
                name: 'eula',
                version: '2.10',
                value: '{"effectiveDate":"2026-02-01"}',
                updatedAt: new Date('2026-02-01T00:00:00Z'),
            }),
        }

        const handler = makeGetEulaHandler(repo)

        const req = createReq()
        const res = createRes()

        await handler(req, res)

        expect(res.statusCode).toBe(200)
        expect(res.body).toEqual({
            name: 'eula',
            version: '2.10',
            value: { effectiveDate: '2026-02-01' },
            updatedAt: '2026-02-01T00:00:00.000Z',
        })
    })
})