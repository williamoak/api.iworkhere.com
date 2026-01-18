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
    },
}))

vi.mock('@src/dto/weapon', () => ({
    emptyWeapon: vi.fn(() => ({
        weapon_id: null,
        name: null,
        class: null,
        description: null,
        weapon_mods: null,
    })),
    toWeaponDTO: vi.fn((row) => ({
        weapon_id: row.weaponId,
        name: row.name,
        class: row.class,
        description: row.description ?? '',
        weapon_mods: row.weapon_mods ?? null,
    })),
}))

/**
 * ------------------------------------------------------------
 * IMPORTS (AFTER MOCKS)
 * ------------------------------------------------------------
 */

import { db } from '@services/dbService'
import GET from '@routes/v1/warframe/weapons/GET'

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

describe('GET /v1/warframe/weapons', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    /**
     * ------------------------------------------------------------
     * NO QUERY — list + empty weapon
     * ------------------------------------------------------------
     */
    test('returns weapon list and empty weapon when no query params supplied', async () => {
        ;(db.select as any).mockReturnValueOnce({
            from: () =>
                Promise.resolve([
                    { weapon_id: '1', name: 'Braton' },
                    { weapon_id: '2', name: 'Braton Prime' },
                ]),
        })

        const req = createReq('/v1/warframe/weapons')
        const res = createRes()

        await GET(req, res)

        expect(db.select).toHaveBeenCalledOnce()
        expect(res.end).toHaveBeenCalledOnce()

        const payload = JSON.parse((res.end as any).mock.calls[0][0])
        expect(payload.success).toBe(true)
        expect(payload.data.weapons.length).toBe(2)
        expect(payload.data.weapon).toMatchObject({
            weapon_id: null,
            name: null,
        })
    })

    /**
     * ------------------------------------------------------------
     * PRIORITY 1 — resolve by weapon_id
     * ------------------------------------------------------------
     */
    test('resolves weapon by weapon_id when provided', async () => {
        ;(db.select as any)
            // 1️⃣ lightweight list
            .mockReturnValueOnce({
                from: () =>
                    Promise.resolve([
                        { weapon_id: '1', name: 'Braton' },
                    ]),
            })
            // 2️⃣ resolution by weapon_id
            .mockReturnValueOnce({
                from: () => ({
                    where: () =>
                        Promise.resolve([
                            {
                                weaponId: '1',
                                name: 'Braton',
                                class: 'normal',
                                description: '',
                                weapon_mods: null,
                            },
                        ]),
                }),
            })

        const req = createReq(
            '/v1/warframe/weapons?weapon_id=880e8400-e29b-41d4-a716-446655440020'
        )
        const res = createRes()

        await GET(req, res)

        expect(db.select).toHaveBeenCalledTimes(2)

        const payload = JSON.parse((res.end as any).mock.calls[0][0])
        expect(payload.data.weapon.name).toBe('Braton')
        expect(payload.data.weapon.class).toBe('normal')
    })

    /**
     * ------------------------------------------------------------
     * PRIORITY 2 — resolve by name + class
     * ------------------------------------------------------------
     */
    test('resolves weapon by name and class when multiple name matches exist', async () => {
        ;(db.select as any)
            // list
            .mockReturnValueOnce({
                from: () =>
                    Promise.resolve([
                        { weapon_id: '1', name: 'Braton' },
                        { weapon_id: '2', name: 'Braton Prime' },
                    ]),
            })
            // name lookup
            .mockReturnValueOnce({
                from: () => ({
                    where: () =>
                        Promise.resolve([
                            { weaponId: '1', name: 'Braton', class: 'normal' },
                            { weaponId: '2', name: 'Braton', class: 'prime' },
                        ]),
                }),
            })

        const req = createReq(
            '/v1/warframe/weapons?name=Braton&class=prime'
        )
        const res = createRes()

        await GET(req, res)

        const payload = JSON.parse((res.end as any).mock.calls[0][0])
        expect(payload.data.weapon.class).toBe('prime')
    })

    /**
     * ------------------------------------------------------------
     * NAME PROVIDED — no resolvable match
     * ------------------------------------------------------------
     */
    test('returns empty weapon when name resolution yields no single match', async () => {
        ;(db.select as any)
            // list
            .mockReturnValueOnce({
                from: () =>
                    Promise.resolve([
                        { weapon_id: '1', name: 'Braton' },
                    ]),
            })
            // name lookup → multiple, but none match class
            .mockReturnValueOnce({
                from: () => ({
                    where: () =>
                        Promise.resolve([
                            { weaponId: '1', name: 'Braton', class: 'normal' },
                            { weaponId: '2', name: 'Braton', class: 'prime' },
                        ]),
                }),
            })

        const req = createReq(
            '/v1/warframe/weapons?name=Braton&class=wraith'
        )
        const res = createRes()

        await GET(req, res)

        const payload = JSON.parse((res.end as any).mock.calls[0][0])
        expect(payload.data.weapon).toMatchObject({
            weapon_id: null,
            name: null,
        })
    })
})
