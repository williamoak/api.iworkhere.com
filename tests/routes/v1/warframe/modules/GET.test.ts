import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'http'

import GET from '@routes/v1/warframe/modules/GET'

// -------------------------
// Mocks
// -------------------------
vi.mock('@db/schema', () => ({
    modules: {
        modId: 'mod_id',
        name: 'name',
    },
}))

vi.mock('@services/dbService', () => ({
    db: {
        select: vi.fn(),
    },
}))

vi.mock('@src/dto/module', () => ({
    emptyModule: vi.fn(() => ({
        mod_id: null,
        name: null,
        description: null,
        rarity: null,
        polarity: null,
        rank_max: null,
    })),
    toModuleDTO: vi.fn((row) => ({
        mod_id: row.modId,
        name: row.name,
        description: row.description,
        rarity: row.rarity,
        polarity: row.polarity,
        rank_max: row.rankMax,
    })),
}))

import { db } from '@services/dbService'
import { emptyModule, toModuleDTO } from '@src/dto/module'

// -------------------------
// Helpers
// -------------------------
function createReq(url: string): IncomingMessage {
    return { url } as IncomingMessage
}

function createRes() {
    const res: Partial<ServerResponse> = {}
    res.setHeader = vi.fn()
    res.end = vi.fn()
    return res as ServerResponse
}

// -------------------------
// Tests
// -------------------------
describe('GET /v1/warframe/modules', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    test('returns module list and empty module when no query params supplied', async () => {
        ;(db.select as any)
            // first select → module list
            .mockReturnValueOnce({
                from: () => Promise.resolve([
                    { mod_id: '1', name: 'Vitality' },
                    { mod_id: '2', name: 'Redirection' },
                ]),
            })

        const req = createReq('/v1/warframe/modules')
        const res = createRes()

        await GET(req, res)

        expect(emptyModule).toHaveBeenCalledOnce()

        expect(res.end).toHaveBeenCalledOnce()
        const payload = JSON.parse((res.end as any).mock.calls[0][0])

        expect(payload.success).toBe(true)
        expect(payload.data.modules.length).toBe(2)
        expect(payload.data.module).toMatchObject({
            mod_id: null,
            name: null,
        })
    })

    test('resolves module by mod_id with highest priority', async () => {
        ;(db.select as any)
            // module list
            .mockReturnValueOnce({
                from: () => Promise.resolve([{ mod_id: '1', name: 'Vitality' }]),
            })
            // mod_id resolution
            .mockReturnValueOnce({
                from: () => ({
                    where: () =>
                        Promise.resolve([
                            {
                                modId: '1',
                                name: 'Vitality',
                                description: 'HP boost',
                                rarity: 'common',
                                polarity: 'vazarin',
                                rankMax: 10,
                            },
                        ]),
                }),
            })

        const req = createReq(
            '/v1/warframe/modules?mod_id=550e8400-e29b-41d4-a716-446655440000'
        )
        const res = createRes()

        await GET(req, res)

        expect(toModuleDTO).toHaveBeenCalledOnce()

        const payload = JSON.parse((res.end as any).mock.calls[0][0])
        expect(payload.data.module.name).toBe('Vitality')
    })

    test('falls back to name resolution when no mod_id is supplied', async () => {
        ;(db.select as any)
            // module list
            .mockReturnValueOnce({
                from: () => Promise.resolve([{ mod_id: '2', name: 'Redirection' }]),
            })
            // name resolution
            .mockReturnValueOnce({
                from: () => ({
                    where: () =>
                        Promise.resolve([
                            {
                                modId: '2',
                                name: 'Redirection',
                                description: 'Shield boost',
                                rarity: 'common',
                                polarity: 'madurai',
                                rankMax: 10,
                            },
                        ]),
                }),
            })

        const req = createReq('/v1/warframe/modules?name=Redirection')
        const res = createRes()

        await GET(req, res)

        const payload = JSON.parse((res.end as any).mock.calls[0][0])
        expect(payload.data.module.name).toBe('Redirection')
    })
})
