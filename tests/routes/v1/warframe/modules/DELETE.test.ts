import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'http'

/**
 * ------------------------------------------------------------
 * MOCKS — MUST APPEAR BEFORE HANDLER IMPORT
 * ------------------------------------------------------------
 */

vi.mock('@db/schema', () => ({
    modules: {
        modId: 'mod_id',
    },
}))

vi.mock('@services/dbService', () => ({
    db: {
        delete: vi.fn(),
    },
}))

/**
 * ------------------------------------------------------------
 * IMPORTS (AFTER MOCKS)
 * ------------------------------------------------------------
 */

import { db } from '@services/dbService'
import DELETE from '@routes/v1/warframe/modules/DELETE'

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

describe('DELETE /v1/warframe/modules', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    /**
     * ------------------------------------------------------------
     * SUCCESS — record exists
     * ------------------------------------------------------------
     */
    test('deletes a module by mod_id and returns deleted record', async () => {
        ;(db.delete as any).mockReturnValueOnce({
            where: () => ({
                returning: () =>
                    Promise.resolve([
                        {
                            modId: '1',
                            name: 'Vitality',
                        },
                    ]),
            }),
        })

        const req = createReq(
            '/v1/warframe/modules?mod_id=550e8400-e29b-41d4-a716-446655440000'
        )
        const res = createRes()

        await DELETE(req, res)

        expect(db.delete).toHaveBeenCalledOnce()
        expect(res.end).toHaveBeenCalledOnce()

        const payload = JSON.parse((res.end as any).mock.calls[0][0])
        expect(payload.success).toBe(true)
        expect(payload.data.name).toBe('Vitality')
    })

    /**
     * ------------------------------------------------------------
     * SUCCESS — no matching record
     * ------------------------------------------------------------
     */
    test('succeeds with null data when no matching record exists', async () => {
        ;(db.delete as any).mockReturnValueOnce({
            where: () => ({
                returning: () => Promise.resolve([]),
            }),
        })

        const req = createReq(
            '/v1/warframe/modules?mod_id=nonexistent-id'
        )
        const res = createRes()

        await DELETE(req, res)

        expect(res.end).toHaveBeenCalledOnce()

        const payload = JSON.parse((res.end as any).mock.calls[0][0])
        expect(payload.success).toBe(true)
        expect(payload.data).toBeNull()
    })

    /**
     * ------------------------------------------------------------
     * ERROR — missing mod_id
     * ------------------------------------------------------------
     */
    test('returns 400 when mod_id is missing', async () => {
        const req = createReq('/v1/warframe/modules')
        const res = createRes()

        await DELETE(req, res)

        expect(res.end).toHaveBeenCalledOnce()

        const payload = JSON.parse((res.end as any).mock.calls[0][0])
        expect(payload.success).toBe(false)
        expect(payload.error).toContain('mod_id is required')
    })
})
