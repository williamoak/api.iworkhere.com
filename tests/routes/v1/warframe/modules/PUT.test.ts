import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'http'

/**
 * ------------------------------------------------------------
 * MOCKS — MUST APPEAR BEFORE THE HANDLER IMPORT
 * ------------------------------------------------------------
 */

vi.mock('@db/schema', () => ({
    modules: {
        modId: 'mod_id',
        name: 'name',
    },
}))

vi.mock('@services/dbService', () => ({
    db: {
        select: vi.fn(),
        insert: vi.fn(),
        update: vi.fn(),
    },
}))

vi.mock('@src/validation/module', () => ({
    moduleInsertSchema: {
        parse: vi.fn((v) => v),
    },
    moduleUpdateSchema: {
        parse: vi.fn((v) => v),
    },
    moduleUpdateByNameSchema: {
        parse: vi.fn((v) => v),
    },
}))

vi.mock('@src/db/mappers/moduleWrite', () => ({
    toModuleWrite: vi.fn((v) => v),
}))

vi.mock('@src/dto/module', () => ({
    emptyModule: vi.fn(() => ({})),
    toModuleDTO: vi.fn((row) => row),
}))

vi.mock('@src/dto/dtoOverlay', () => ({
    overlayDto: vi.fn(() => ({
        merged: {},
        providedFields: new Set(),
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

function createReq(body: any): IncomingMessage {
    return ({ body } as unknown) as IncomingMessage
}

function createRes(): ServerResponse {
    const res: Partial<ServerResponse> = {}
    res.setHeader = vi.fn()
    res.end = vi.fn()
    return res as ServerResponse
}

/**
 * ------------------------------------------------------------
 * TESTS
 * ------------------------------------------------------------
 */

describe('PUT /v1/warframe/modules', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    /**
     * ------------------------------------------------------------
     * INSERT by name (0 existing matches)
     * ------------------------------------------------------------
     */
    test('inserts a module when name resolves to zero existing records', async () => {
        // 1️⃣ name lookup → zero matches
        ;(db.select as any).mockReturnValueOnce({
            from: () => ({
                where: () => Promise.resolve([]),
            }),
        })

        // 2️⃣ insert path
        ;(db.insert as any).mockReturnValueOnce({
            values: () => ({
                returning: () =>
                    Promise.resolve([
                        { modId: '1', name: 'Vitality' },
                    ]),
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
        expect(res.end).toHaveBeenCalledOnce()

        const payload = JSON.parse((res.end as any).mock.calls[0][0])
        expect(payload.success).toBe(true)
        expect(payload.data.name).toBe('Vitality')
    })

    /**
     * ------------------------------------------------------------
     * UPDATE by mod_id
     * ------------------------------------------------------------
     */
    test('updates a module when mod_id is provided', async () => {
        ;(db.update as any).mockReturnValueOnce({
            set: () => ({
                where: () => ({
                    returning: () =>
                        Promise.resolve([
                            { modId: '1', name: 'Vitality' },
                        ]),
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
        expect(res.end).toHaveBeenCalledOnce()

        const payload = JSON.parse((res.end as any).mock.calls[0][0])
        expect(payload.success).toBe(true)
    })

    /**
     * ------------------------------------------------------------
     * CONFLICT — multiple name matches
     * ------------------------------------------------------------
     */
    test('returns 409 when name resolves to multiple records', async () => {
        ;(db.select as any).mockReturnValueOnce({
            from: () => ({
                where: () =>
                    Promise.resolve([
                        { modId: '1' },
                        { modId: '2' },
                    ]),
            }),
        })

        const req = createReq({
            name: 'DuplicateModule',
        })
        const res = createRes()

        await PUT(req, res)

        expect(res.end).toHaveBeenCalledOnce()

        const payload = JSON.parse((res.end as any).mock.calls[0][0])
        expect(payload.success).toBe(false)
        expect(payload.error).toContain('Multiple modules')
    })
})
