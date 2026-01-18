import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'http'

/**
 * ------------------------------------------------------------
 * MOCKS — MUST APPEAR BEFORE HANDLER IMPORT
 * ------------------------------------------------------------
 */

vi.mock('@db/schema', () => ({
    warframe: {
        warframeId: 'warframe_id',
        name: 'name',
        class: 'class',
    },
}))

vi.mock('@services/dbService', () => ({
    db: {
        select: vi.fn(),
        insert: vi.fn(),
        update: vi.fn(),
    },
}))

vi.mock('@src/validation/warframe', () => ({
    warframeInsertSchema: {
        parse: vi.fn((v) => v),
    },
    warframeUpdateSchema: {
        parse: vi.fn((v) => v),
    },
    warframeUpdateByNameSchema: {
        parse: vi.fn((v) => v),
    },
}))

vi.mock('@src/db/mappers/warframeWrite', () => ({
    toWarframeWrite: vi.fn((v) => v),
}))

vi.mock('@src/dto/warframe', () => ({
    emptyWarframe: vi.fn(() => ({})),
    toWarframeDTO: vi.fn((row) => row),
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
import PUT from '@routes/v1/warframe/warframes/PUT'

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

describe('PUT /v1/warframe/warframes', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    /**
     * ------------------------------------------------------------
     * UPDATE by warframe_id (highest priority)
     * ------------------------------------------------------------
     */
    test('updates a warframe when warframe_id is provided', async () => {
        ;(db.update as any).mockReturnValueOnce({
            set: () => ({
                where: () => ({
                    returning: () =>
                        Promise.resolve([
                            { warframeId: '1', name: 'Excalibur', class: 'normal' },
                        ]),
                }),
            }),
        })

        const req = createReq({
            warframe_id: '1',
            name: 'Excalibur',
            health: 120,
        })
        const res = createRes()

        await PUT(req, res)

        expect(db.update).toHaveBeenCalledOnce()
        expect(res.end).toHaveBeenCalledOnce()

        const payload = JSON.parse((res.end as any).mock.calls[0][0])
        expect(payload.success).toBe(true)
        expect(payload.data.name).toBe('Excalibur')
    })

    /**
     * ------------------------------------------------------------
     * INSERT by name (0 matches, class defaults to "normal")
     * ------------------------------------------------------------
     */
    test('inserts a warframe when name resolves to zero records', async () => {
        // name lookup → 0 matches
        ;(db.select as any).mockReturnValueOnce({
            from: () => ({
                where: () => Promise.resolve([]),
            }),
        })

        // insert
        ;(db.insert as any).mockReturnValueOnce({
            values: () => ({
                returning: () =>
                    Promise.resolve([
                        { warframeId: '2', name: 'Mag', class: 'normal' },
                    ]),
            }),
        })

        const req = createReq({
            name: 'Mag',
            health: 80,
            shield: 150,
        })
        const res = createRes()

        await PUT(req, res)

        expect(db.select).toHaveBeenCalledOnce()
        expect(db.insert).toHaveBeenCalledOnce()

        const payload = JSON.parse((res.end as any).mock.calls[0][0])
        expect(payload.success).toBe(true)
        expect(payload.data.class).toBe('normal')
    })

    /**
     * ------------------------------------------------------------
     * CONFLICT — multiple records match name + class
     * ------------------------------------------------------------
     */
    test('returns 409 when multiple warframes match name and class', async () => {
        ;(db.select as any).mockReturnValueOnce({
            from: () => ({
                where: () =>
                    Promise.resolve([
                        { warframeId: '1', class: 'normal' },
                        { warframeId: '2', class: 'normal' },
                    ]),
            }),
        })

        const req = createReq({
            name: 'Excalibur',
            class: 'normal',
        })
        const res = createRes()

        await PUT(req, res)

        expect(res.end).toHaveBeenCalledOnce()

        const payload = JSON.parse((res.end as any).mock.calls[0][0])
        expect(payload.success).toBe(false)
        expect(payload.error).toContain('Multiple warframes')
    })
})
