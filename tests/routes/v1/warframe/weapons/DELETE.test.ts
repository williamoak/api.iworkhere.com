import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'http'

/**
 * ------------------------------------------------------------
 * MOCKS — MUST APPEAR BEFORE HANDLER IMPORT
 * ------------------------------------------------------------
 */

vi.mock('@db/schema', () => ({
    weapons: {
        weaponId: 'weapon_id',
        name: 'name',
        type: 'type',
        damage: 'damage',
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
import DELETE from '@routes/v1/warframe/weapons/DELETE'

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

describe('DELETE /v1/warframe/weapons', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    /**
     * ------------------------------------------------------------
     * SUCCESS — record exists
     * ------------------------------------------------------------
     */
    test('deletes a weapon by weapon_id and returns deleted record', async () => {
        ;(db.delete as any).mockReturnValueOnce({
            where: () => ({
                returning: () =>
                    Promise.resolve([
                        {
                            weaponId: '880e8400-e29b-41d4-a716-446655440020',
                            name: 'Braton',
                            type: 'rifle',
                            damage: 35,
                        },
                    ]),
            }),
        })

        const req = createReq(
            '/v1/warframe/weapons?weapon_id=880e8400-e29b-41d4-a716-446655440020'
        )
        const res = createRes()

        await DELETE(req, res)

        expect(db.delete).toHaveBeenCalledOnce()
        expect(res.end).toHaveBeenCalledOnce()

        const payload = JSON.parse((res.end as any).mock.calls[0][0])
        expect(payload.success).toBe(true)
        expect(payload.data.name).toBe('Braton')
    })

    /**
     * ------------------------------------------------------------
     * SUCCESS — no matching record
     * ------------------------------------------------------------
     */
    test('succeeds with null data when no matching weapon exists', async () => {
        ;(db.delete as any).mockReturnValueOnce({
            where: () => ({
                returning: () => Promise.resolve([]),
            }),
        })

        const req = createReq(
            '/v1/warframe/weapons?weapon_id=nonexistent-id'
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
     * ERROR — missing weapon_id
     * ------------------------------------------------------------
     */
    test('returns 400 when weapon_id is missing', async () => {
        const req = createReq('/v1/warframe/weapons')
        const res = createRes()

        await DELETE(req, res)

        expect(res.end).toHaveBeenCalledOnce()

        const payload = JSON.parse((res.end as any).mock.calls[0][0])
        expect(payload.success).toBe(false)
        expect(payload.error).toContain('weapon_id is required')
    })
})
