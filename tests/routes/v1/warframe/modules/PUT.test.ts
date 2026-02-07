/**
 * @myDocBlock v2.3
 * @file PUT.test.ts
 * @internal
 * @module tests/routes/v1/warframe/modules
 * @tag warframe, modules, test
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path tests/routes/v1/warframe/modules/PUT.test.ts
 * @summary Unit tests for PUT /v1/warframe/modules endpoint glue logic.
 * @description
 * Verifies that PUT /v1/warframe/modules:
 *   - inserts when name resolves to zero existing records
 *   - updates when mod_id is provided
 *   - returns 409 when name resolves to multiple records
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
 *     "routes/v1/warframe/modules/PUT"
 *   ]
 * }
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { Request, Response } from 'express'

/**
 * ------------------------------------------------------------
 * MOCKS — MUST APPEAR BEFORE THE HANDLER IMPORT
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
        insert: vi.fn(),
        update: vi.fn(),
    },
}))

vi.mock('@src/validation/module', () => ({
    __esModule: true,
    moduleInsertSchema: {
        parse: vi.fn((v: any) => v),
    },
    moduleUpdateSchema: {
        parse: vi.fn((v: any) => v),
    },
    moduleUpdateByNameSchema: {
        parse: vi.fn((v: any) => v),
    },
}))

vi.mock('@src/db/mappers/moduleWrite', () => ({
    __esModule: true,
    toModuleWrite: vi.fn((v: any) => v),
}))

vi.mock('@src/dto/module', () => ({
    __esModule: true,
    emptyModule: vi.fn(() => ({})),
    toModuleDTO: vi.fn((row: any) => row),
}))

vi.mock('@src/dto/dtoOverlay', () => ({
    __esModule: true,
    overlayDto: vi.fn(() => ({
        merged: {},
        providedFields: new Set<string>(),
    })),
}))

/**
 * ------------------------------------------------------------
 * IMPORTS (AFTER MOCKS)
 * ------------------------------------------------------------
 */

import { db } from '@services/dbService'
import PUT from '@routes/v1/warframe/modules/PUT'

/**
 * ------------------------------------------------------------
 * HELPERS
 * ------------------------------------------------------------
 */

function createReq(body: any): Request {
    return {
        body,
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

describe('PUT /v1/warframe/modules', () => {
    test('inserts a module when name resolves to zero existing records', async () => {
        // 1) name lookup → zero matches
        ;(db.select as any).mockReturnValueOnce({
            from: () => ({
                where: async () => [],
            }),
        })

        // 2) insert path
        ;(db.insert as any).mockReturnValueOnce({
            values: () => ({
                returning: async () => [{ modId: '1', name: 'Vitality' }],
            }),
        })

        const req = createReq({
            name: 'Vitality',
            description: 'Increases health',
        })
        const res = createRes()

        await PUT(req, res)

        expect(db.select).toHaveBeenCalledOnce()
        expect(db.insert).toHaveBeenCalledOnce()

        expect(res.statusCode).toBe(200)
        expect(res.body.success).toBe(true)
        expect(res.body.data.name).toBe('Vitality')
    })

    test('updates a module when mod_id is provided', async () => {
        ;(db.update as any).mockReturnValueOnce({
            set: () => ({
                where: () => ({
                    returning: async () => [{ modId: '1', name: 'Vitality' }],
                }),
            }),
        })

        const req = createReq({
            mod_id: '1',
            description: 'Updated description',
        })
        const res = createRes()

        await PUT(req, res)

        expect(db.update).toHaveBeenCalledOnce()

        expect(res.statusCode).toBe(200)
        expect(res.body.success).toBe(true)
    })

    test('returns 409 when name resolves to multiple records', async () => {
        ;(db.select as any).mockReturnValueOnce({
            from: () => ({
                where: async () => [{ modId: '1' }, { modId: '2' }],
            }),
        })

        const req = createReq({
            name: 'DuplicateModule',
        })
        const res = createRes()

        await PUT(req, res)

        expect(res.statusCode).toBe(409)
        expect(res.body.success).toBe(false)
        expect(res.body.error).toContain('Multiple modules')
    })
})