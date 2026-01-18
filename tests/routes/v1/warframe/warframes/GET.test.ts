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
    },
}))

vi.mock('@services/dbService', () => ({
    db: {
        select: vi.fn(),
    },
}))

vi.mock('@src/dto/warframe', () => ({
    emptyWarframe: vi.fn(() => ({
        warframe_id: null,
        name: null,
        health: null,
        shield: null,
        armor: null,
        energy: null,
    })),
    toWarframeDTO: vi.fn((row) => ({
        warframe_id: row.warframeId,
        name: row.name,
        health: row.health,
        shield: row.shield,
        armor: row.armor,
        energy: row.energy,
    })),
}))

/**
 * ------------------------------------------------------------
 * IMPORTS (AFTER MOCKS)
 * ------------------------------------------------------------
 */

import { db } from '@services/dbService'
import GET from '@routes/v1/warframe/warframes/GET'

/**
 * ------------------------------------------------------------
 * HELPERS
 * ------------------------------------------------------------
 */

function createReq(url: string): IncomingMessage {
    return ({ url } as unknown) as IncomingMessage
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

describe('GET /v1/warframe/warframes', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    /**
     * ------------------------------------------------------------
     * NO QUERY — list + empty warframe
     * ------------------------------------------------------------
     */
    test('returns warframe list and empty warframe when no query params supplied', async () => {
        ;(db.select as any).mockReturnValueOnce({
            from: () =>
                Promise.resolve([
                    { warframe_id: '1', name: 'Excalibur' },
                    { warframe_id: '2', name: 'Mag' },
                ]),
        })

        const req = createReq('/v1/warframe/warframes')
        const res = createRes()

        await GET(req, res)

        expect(db.select).toHaveBeenCalledOnce()
        expect(res.end).toHaveBeenCalledOnce()

        const payload = JSON.parse((res.end as any).mock.calls[0][0])

        expect(payload.success).toBe(true)
        expect(payload.data.warframes.length).toBe(2)
        expect(payload.data.warframe).toMatchObject({
            warframe_id: null,
            name: null,
        })
    })

    /**
     * ------------------------------------------------------------
     * QUERY — resolve by warframe_id
     * ------------------------------------------------------------
     */
    test('resolves a warframe when warframe_id is provided', async () => {
        ;(db.select as any)
            // 1️⃣ lightweight list
            .mockReturnValueOnce({
                from: () =>
                    Promise.resolve([
                        { warframe_id: '1', name: 'Excalibur' },
                    ]),
            })
            // 2️⃣ full warframe resolution
            .mockReturnValueOnce({
                from: () => ({
                    where: () =>
                        Promise.resolve([
                            {
                                warframeId: '1',
                                name: 'Excalibur',
                                health: 100,
                                shield: 100,
                                armor: 225,
                                energy: 100,
                            },
                        ]),
                }),
            })

        const req = createReq(
            '/v1/warframe/warframes?warframe_id=660e8400-e29b-41d4-a716-446655440010'
        )
        const res = createRes()

        await GET(req, res)

        expect(db.select).toHaveBeenCalledTimes(2)

        const payload = JSON.parse((res.end as any).mock.calls[0][0])
        expect(payload.data.warframe.name).toBe('Excalibur')
        expect(payload.data.warframe.health).toBe(100)
    })

    /**
     * ------------------------------------------------------------
     * QUERY — no matching record
     * ------------------------------------------------------------
     */
    test('returns empty warframe when warframe_id does not match any record', async () => {
        ;(db.select as any)
            // list
            .mockReturnValueOnce({
                from: () =>
                    Promise.resolve([
                        { warframe_id: '1', name: 'Excalibur' },
                    ]),
            })
            // lookup → no matches
            .mockReturnValueOnce({
                from: () => ({
                    where: () => Promise.resolve([]),
                }),
            })

        const req = createReq(
            '/v1/warframe/warframes?warframe_id=nonexistent'
        )
        const res = createRes()

        await GET(req, res)

        const payload = JSON.parse((res.end as any).mock.calls[0][0])
        expect(payload.data.warframe).toMatchObject({
            warframe_id: null,
            name: null,
        })
    })
})
