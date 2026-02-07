/**
 * @myDocBlock v2.3
 * @file GET.test.ts
 * @internal
 * @module tests/routes/v1/warframe/modules
 * @tag warframe, modules, test
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path tests/routes/v1/warframe/modules/GET.test.ts
 * @summary Unit tests for GET /v1/warframe/modules endpoint glue logic.
 * @description
 * Verifies that GET /v1/warframe/modules:
 *   - always returns a lightweight module list
 *   - returns emptyModule() when no resolution match is found
 *   - resolves by mod_id with highest priority (first match wins)
 *   - falls back to exact name resolution when no mod_id is supplied
 *   - returns 500 on unexpected errors (and logs an error)
 *
 * @query
 *   {}
 *
 * @requestExample
 * none
 *
 * @response
 * {
 *   "ok": true
 * }
 *
 * @requires
 * {
 *   "routes": [
 *     "routes/v1/warframe/modules/GET"
 *   ]
 * }
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { Request, Response } from 'express'

/**
 * ------------------------------------------------------------
 * MOCKS — MUST APPEAR BEFORE IMPORTS
 * ------------------------------------------------------------
 */

vi.mock('@db/schema', () => ({
    __esModule: true,
    modules: {
        modId: 'mod_id',
        name: 'name',
    },
}))

vi.mock('@services/dbService', () => ({
    __esModule: true,
    db: {
        select: vi.fn(),
    },
}))

vi.mock('@src/dto/module', () => ({
    __esModule: true,
    emptyModule: vi.fn(() => ({
        mod_id: null,
        name: null,
        description: null,
        rarity: null,
        polarity: null,
        rank_max: null,
    })),
    toModuleDTO: vi.fn((row: any) => ({
        mod_id: row.modId,
        name: row.name,
        description: row.description,
        rarity: row.rarity,
        polarity: row.polarity,
        rank_max: row.rankMax,
    })),
}))

/**
 * ------------------------------------------------------------
 * IMPORTS (AFTER MOCKS)
 * ------------------------------------------------------------
 */

import GET from '@routes/v1/warframe/modules/GET'
import { db } from '@services/dbService'
import { emptyModule, toModuleDTO } from '@src/dto/module'

/**
 * ------------------------------------------------------------
 * HELPERS
 * ------------------------------------------------------------
 */

function createReq(query: any): Request {
    return {
        query,
    } as unknown as Request
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

        end() {
            return this
        },
    }

    return res as unknown as ResMock
}

beforeEach(() => {
    vi.resetAllMocks()
})

/**
 * ------------------------------------------------------------
 * TESTS
 * ------------------------------------------------------------
 */

describe('GET /v1/warframe/modules', () => {
    test('returns module list and empty module when no query params supplied', async () => {
        ;(db.select as any).mockReturnValueOnce({
            from: async () => [
                { mod_id: '1', name: 'Vitality' },
                { mod_id: '2', name: 'Redirection' },
            ],
        })

        const req = createReq({})
        const res = createRes()

        await GET(req, res)

        expect(emptyModule).toHaveBeenCalledOnce()
        expect(res.statusCode).toBe(200)

        expect(res.body.success).toBe(true)
        expect(res.body.data.modules).toHaveLength(2)
        expect(res.body.data.module).toMatchObject({
            mod_id: null,
            name: null,
        })
    })

    test('resolves module by mod_id with highest priority', async () => {
        ;(db.select as any)
            // module list
            .mockReturnValueOnce({
                from: async () => [{ mod_id: '1', name: 'Vitality' }],
            })
            // mod_id resolution
            .mockReturnValueOnce({
                from: () => ({
                    where: async () => [
                        {
                            modId: '1',
                            name: 'Vitality',
                            description: 'HP boost',
                            rarity: 'common',
                            polarity: 'vazarin',
                            rankMax: 10,
                        },
                    ],
                }),
            })

        const req = createReq({
            mod_id: '550e8400-e29b-41d4-a716-446655440000',
        })
        const res = createRes()

        await GET(req, res)

        expect(toModuleDTO).toHaveBeenCalledOnce()
        expect(res.statusCode).toBe(200)
        expect(res.body.data.module.name).toBe('Vitality')
    })

    test('falls back to name resolution when no mod_id is supplied', async () => {
        ;(db.select as any)
            // module list
            .mockReturnValueOnce({
                from: async () => [{ mod_id: '2', name: 'Redirection' }],
            })
            // name resolution
            .mockReturnValueOnce({
                from: () => ({
                    where: async () => [
                        {
                            modId: '2',
                            name: 'Redirection',
                            description: 'Shield boost',
                            rarity: 'common',
                            polarity: 'madurai',
                            rankMax: 10,
                        },
                    ],
                }),
            })

        const req = createReq({ name: 'Redirection' })
        const res = createRes()

        await GET(req, res)

        expect(res.statusCode).toBe(200)
        expect(res.body.data.module.name).toBe('Redirection')
    })

    test('returns 500 on unexpected errors', async () => {
        const consoleErrorSpy = vi
            .spyOn(console, 'error')
            .mockImplementation(() => {})

        ;(db.select as any).mockImplementationOnce(() => {
            throw new Error('boom')
        })

        const req = createReq({})
        const res = createRes()

        await GET(req, res)

        expect(res.statusCode).toBe(500)
        expect(res.body).toEqual({
            success: false,
            error: 'Internal server error',
        })

        consoleErrorSpy.mockRestore()
    })
})
