/**
 * @myDocBlock v2.3
 * @file DELETE.test.ts
 * @internal
 * @module tests/routes/v1/warframe/modules
 * @tag warframe, modules, test
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path tests/routes/v1/warframe/modules/DELETE.test.ts
 * @summary Unit tests for DELETE /v1/warframe/modules endpoint glue logic.
 * @description
 * Verifies that DELETE /v1/warframe/modules:
 *   - deletes a module when mod_id is supplied
 *   - succeeds with null data when no record exists
 *   - returns 400 when mod_id is missing
 *   - returns 500 on unexpected errors
 *
 * @query
 * {
 *   "mod_id": "string"
 * }
 *
 * @requestExample
 * none
 *
 * @response
 * {
 *   "success": true
 * }
 *
 * @requires
 * {
 *   "routes": [
 *     "routes/v1/warframe/modules/DELETE"
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
    },
}))

vi.mock('@services/dbService', () => ({
    __esModule: true,
    db: {
        delete: vi.fn(),
    },
}))

/**
 * ------------------------------------------------------------
 * IMPORTS (AFTER MOCKS)
 * ------------------------------------------------------------
 */

import DELETE from '@routes/v1/warframe/modules/DELETE'
import { db } from '@services/dbService'

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

describe('DELETE /v1/warframe/modules', () => {
    test('deletes a module by mod_id and returns deleted record', async () => {
        ;(db.delete as any).mockReturnValueOnce({
            where: () => ({
                returning: async () => [
                    {
                        modId: '1',
                        name: 'Vitality',
                    },
                ],
            }),
        })

        const req = createReq({
            mod_id: '550e8400-e29b-41d4-a716-446655440000',
        })
        const res = createRes()

        await DELETE(req, res)

        expect(db.delete).toHaveBeenCalledOnce()
        expect(res.statusCode).toBe(200)
        expect(res.body.success).toBe(true)
        expect(res.body.data.name).toBe('Vitality')
    })

    test('succeeds with null data when no matching record exists', async () => {
        ;(db.delete as any).mockReturnValueOnce({
            where: () => ({
                returning: async () => [],
            }),
        })

        const req = createReq({
            mod_id: 'nonexistent-id',
        })
        const res = createRes()

        await DELETE(req, res)

        expect(res.statusCode).toBe(200)
        expect(res.body.success).toBe(true)
        expect(res.body.data).toBeNull()
    })

    test('returns 400 when mod_id is missing', async () => {
        const req = createReq({})
        const res = createRes()

        await DELETE(req, res)

        expect(res.statusCode).toBe(400)
        expect(res.body.success).toBe(false)
        expect(res.body.error).toContain('mod_id is required')
    })

    test('returns 500 on unexpected errors', async () => {
        const consoleErrorSpy = vi
            .spyOn(console, 'error')
            .mockImplementation(() => {})

        ;(db.delete as any).mockImplementationOnce(() => {
            throw new Error('boom')
        })

        const req = createReq({
            mod_id: '1',
        })
        const res = createRes()

        await DELETE(req, res)

        expect(res.statusCode).toBe(500)
        expect(res.body).toEqual({
            success: false,
            error: 'Internal server error',
        })

        consoleErrorSpy.mockRestore()
    })
})
