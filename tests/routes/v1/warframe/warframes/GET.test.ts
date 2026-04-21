/**
 * @myDocBlock v2.3
 * @file GET.test.ts
 * @internal
 * @module tests/routes/v1/warframe/warframes
 * @tag warframe, warframes, test
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path tests/routes/v1/warframe/warframes/GET.test.ts
 * @summary Unit tests for GET /v1/warframe/warframes endpoint glue logic.
 * @description
 * Verifies that GET /v1/warframe/warframes:
 *   - always returns a lightweight warframe list
 *   - returns emptyWarframe() when no resolution match is found
 *   - resolves by warframe_id (first match wins)
 *   - returns 500 on unexpected errors
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
 *     "routes/v1/warframe/warframes/GET"
 *   ]
 * }
 */

import { describe, test, expect, vi, beforeEach } from "vitest"
import type { Request, Response } from "express"

/**
 * ------------------------------------------------------------
 * MOCKS — MUST APPEAR BEFORE IMPORTS
 * ------------------------------------------------------------
 */

vi.mock("@db/schema", () => ({
    __esModule: true,
    warframes: {
        warframeId: "warframe_id",
        name: "name",
    },
}))

vi.mock("@services/dbService", () => ({
    __esModule: true,
    db: {
        select: vi.fn(),
    },
}))

vi.mock("@src/dto/warframe", () => ({
    __esModule: true,
    emptyWarframe: vi.fn(() => ({
        warframe_id: null,
        name: null,
        class: null,
        lore: "",
        base_health: null,
        effective_health: null,
        base_shield: null,
        effective_shield: null,
        base_armour: null,
        effective_armour: null,
        base_energy: null,
        effective_energy: null,
        base_ability_strength: null,
        effective_ability_strength: null,
        base_range: null,
        effective_range: null,
        base_duration: null,
        effective_duration: null,
        base_ability_efficiency: null,
        effective_ability_efficiency: null,
        base_sprint_speed: null,
        effective_sprint_speed: null,
        base_capacity: null,
        effective_capacity: null,
        max_passives: null,
        current_passives: null,
        max_abilities: null,
        current_abilities: null,
        max_mods: null,
        current_mods: null,
        max_aura_mods: null,
        current_aura_mods: null,
        max_exilus_mods: null,
        current_exilus_mods: null,
        max_arcanes: null,
        current_arcanes: null,
        max_shards: null,
        current_shards: null,
        weapons_loadout: null,
    })),
    toWarframeDTO: vi.fn((row: any) => ({
        warframe_id: row.warframeId,
        name: row.name,
        base_health: row.baseHealth ?? null,
        base_shield: row.baseShield ?? null,
        base_armour: row.baseArmour ?? null,
        base_energy: row.baseEnergy ?? null,
    })),
}))

/**
 * ------------------------------------------------------------
 * IMPORTS (AFTER MOCKS)
 * ------------------------------------------------------------
 */

import GET from "@routes/v1/warframe/warframes/GET"
import { db } from "@services/dbService"
import { emptyWarframe, toWarframeDTO } from "@src/dto/warframe"

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
    vi.clearAllMocks()
})

/**
 * ------------------------------------------------------------
 * TESTS
 * ------------------------------------------------------------
 */

describe("GET /v1/warframe/warframes", () => {
    test("returns warframe list and empty warframe when no query params supplied", async () => {
        ;(db.select as any).mockReturnValueOnce({
            from: async () => [
                { warframe_id: "1", name: "Excalibur" },
                { warframe_id: "2", name: "Mag" },
            ],
        })

        const req = createReq({})
        const res = createRes()

        await GET(req, res)

        expect(emptyWarframe).toHaveBeenCalledOnce()
        expect(res.statusCode).toBe(200)

        expect(res.body.success).toBe(true)
        expect(res.body.data.warframes).toHaveLength(2)
        expect(res.body.data.warframe).toMatchObject({
            warframe_id: null,
            name: null,
        })
    })

    test("resolves a warframe when warframe_id is provided", async () => {
        ;(db.select as any)
            // lightweight list
            .mockReturnValueOnce({
                from: async () => [
                    { warframe_id: "1", name: "Excalibur" },
                ],
            })
            // resolution query
            .mockReturnValueOnce({
                from: () => ({
                    where: async () => [
                        {
                            warframeId: "1",
                            name: "Excalibur",
                            baseHealth: 100,
                            baseShield: 100,
                            baseArmour: 225,
                            baseEnergy: 100,
                        },
                    ],
                }),
            })

        const req = createReq({
            warframe_id: "660e8400-e29b-41d4-a716-446655440010",
        })
        const res = createRes()

        await GET(req, res)

        expect(toWarframeDTO).toHaveBeenCalledOnce()
        expect(res.statusCode).toBe(200)
        expect(res.body.data.warframe.name).toBe("Excalibur")
        expect(res.body.data.warframe.base_health).toBe(100)
    })

    test("returns empty warframe when warframe_id does not match any record", async () => {
        ;(db.select as any)
            .mockReturnValueOnce({
                from: async () => [
                    { warframe_id: "1", name: "Excalibur" },
                ],
            })
            .mockReturnValueOnce({
                from: () => ({
                    where: async () => [],
                }),
            })

        const req = createReq({
            warframe_id: "nonexistent",
        })
        const res = createRes()

        await GET(req, res)

        expect(res.statusCode).toBe(200)
        expect(res.body.data.warframe).toMatchObject({
            warframe_id: null,
            name: null,
        })
    })

    test("returns 500 on unexpected errors", async () => {
        const consoleErrorSpy = vi
            .spyOn(console, "error")
            .mockImplementation(() => {})

        ;(db.select as any).mockImplementationOnce(() => {
            throw new Error("boom")
        })

        const req = createReq({})
        const res = createRes()

        await GET(req, res)

        expect(res.statusCode).toBe(500)
        expect(res.body).toEqual({
            success: false,
            error: "Internal server error",
        })

        consoleErrorSpy.mockRestore()
    })
})
