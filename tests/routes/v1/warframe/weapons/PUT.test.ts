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

vi.mock('@src/validation/weapon', () => ({
    weaponInsertSchema: {
        parse: vi.fn((v) => v),
    },
    weaponUpdateSchema: {
        parse: vi.fn((v) => v),
    },
    weaponUpdateByNameSchema: {
        parse: vi.fn((v) => v),
    },
}))

vi.mock('@src/db/mappers/weaponWrite', () => ({
    toWeaponWrite: vi.fn((v) => v),
}))

vi.mock('@src/dto/weapon', () => ({
    emptyWeapon: vi.fn(() => ({})),
    toWeaponDTO: vi.fn((row) => row),
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
import PUT from '@routes/v1/warframe/weapons/PUT'

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

describe('PUT /v1/warframe/weapons', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    /**
     * ------------------------------------------------------------
     * UPDATE by weapon_id (highest priority)
     * ------------------------------------------------------------
     */
    test('updates a weapon when weapon_id is provided', async () => {
        ;(db.update as any).mockReturnValueOnce({
            set: () => ({
                where: () => ({
                    returning: () =>
                        Promise.resolve([
                            {
                                weaponId: '1',
                                name: 'Braton',
                                class: 'normal',
                                type: 'rifle',
                                damage: 35,
                            },
                        ]),
                }),
            }),
        })

        const req = createReq({
            weapon_id: '1',
            damage: 40,
        })
        const res = createRes()

        await PUT(req, res)

        expect(db.update).toHaveBeenCalledOnce()
        expect(res.end).toHaveBeenCalledOnce()

        const payload = JSON.parse((res.end as any).mock.calls[0][0])
        expect(payload.success).toBe(true)
        expect(payload.data.damage).toBe(35)
    })

    /**
     * ------------------------------------------------------------
     * INSERT by name (0 matches, class defaults to "normal")
     * ------------------------------------------------------------
     */
    test('inserts a weapon when name resolves to zero records', async () => {
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
                        {
                            weaponId: '2',
                            name: 'Braton',
                            class: 'normal',
                            type: 'rifle',
                            damage: 35,
                        },
                    ]),
            }),
        })

        const req = createReq({
            name: 'Braton',
            type: 'rifle',
            damage: 35,
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
     * CONFLICT — multiple name + class matches
     * ------------------------------------------------------------
     */
    test('returns 409 when multiple weapons match name and class', async () => {
        ;(db.select as any).mockReturnValueOnce({
            from: () => ({
                where: () =>
                    Promise.resolve([
                        { weaponId: '1', class: 'normal' },
                        { weaponId: '2', class: 'normal' },
                    ]),
            }),
        })

        const req = createReq({
            name: 'Braton',
            class: 'normal',
        })
        const res = createRes()

        await PUT(req, res)

        expect(res.end).toHaveBeenCalledOnce()

        const payload = JSON.parse((res.end as any).mock.calls[0][0])
        expect(payload.success).toBe(false)
        expect(payload.error).toContain('Multiple weapons')
    })
})
