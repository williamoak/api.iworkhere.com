/**
 * @myDocBlock v2.3
 * @file GET.test.ts
 * @internal
 * @module tests/routes/v1/warframe/weapons
 * @tag warframe, weapons, test
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path tests/routes/v1/warframe/weapons/GET.test.ts
 * @summary Unit tests for GET /v1/warframe/weapons endpoint glue logic.
 * @description
 * Verifies that GET /v1/warframe/weapons:
 *   - always returns a lightweight weapon list
 *   - resolves by weapon_id with highest priority
 *   - resolves by name + class when weapon_id is not provided
 *   - defaults class to "normal"
 *   - returns emptyWeapon() when resolution is ambiguous or missing
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
 *   "success": true
 * }
 *
 * @requires
 * {
 *   "routes": [
 *     "routes/v1/warframe/weapons/GET"
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
    weapons: {
        weaponId: "weapon_id",
        name: "name",
        class: "class",
    },
}))

vi.mock("@services/dbService", () => ({
    __esModule: true,
    db: {
        select: vi.fn(),
    },
}))

vi.mock("@src/dto/weapon", () => ({
    __esModule: true,
    emptyWeapon: vi.fn(() => ({
        weapon_id: null,
        name: null,
        class: null,
        description: null,
        weapon_mods: null,
    })),
    toWeaponDTO: vi.fn((row: any) => ({
        weapon_id: row.weaponId,
        name: row.name,
        class: row.class,
        description: row.description ?? "",
        weapon_mods: row.weapon_mods ?? null,
    })),
}))

/**
 * ------------------------------------------------------------
 * IMPORTS (AFTER MOCKS)
 * ------------------------------------------------------------
 */

import GET from "@routes/v1/warframe/weapons/GET"
import { db } from "@services/dbService"
import { emptyWeapon, toWeaponDTO } from "@src/dto/weapon"

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

describe("GET /v1/warframe/weapons", () => {
    test("returns weapon list and empty weapon when no query params supplied", async () => {
        ;(db.select as any).mockReturnValueOnce({
            from: async () => [
                { weapon_id: "1", name: "Braton" },
                { weapon_id: "2", name: "Braton Prime" },
            ],
        })

        const req = createReq({})
        const res = createRes()

        await GET(req, res)

        expect(emptyWeapon).toHaveBeenCalledOnce()
        expect(res.statusCode).toBe(200)

        expect(res.body.success).toBe(true)
        expect(res.body.data.weapons).toHaveLength(2)
        expect(res.body.data.weapon).toMatchObject({
            weapon_id: null,
            name: null,
        })
    })

    test("resolves weapon by weapon_id when provided", async () => {
        ;(db.select as any)
            // lightweight list
            .mockReturnValueOnce({
                from: async () => [
                    { weapon_id: "1", name: "Braton" },
                ],
            })
            // resolution by weapon_id
            .mockReturnValueOnce({
                from: () => ({
                    where: async () => [
                        {
                            weaponId: "1",
                            name: "Braton",
                            class: "normal",
                            description: "",
                            weapon_mods: null,
                        },
                    ],
                }),
            })

        const req = createReq({
            weapon_id: "880e8400-e29b-41d4-a716-446655440020",
        })
        const res = createRes()

        await GET(req, res)

        expect(toWeaponDTO).toHaveBeenCalledOnce()
        expect(res.statusCode).toBe(200)
        expect(res.body.data.weapon.name).toBe("Braton")
        expect(res.body.data.weapon.class).toBe("normal")
    })

    test("resolves weapon by name and class when multiple name matches exist", async () => {
        ;(db.select as any)
            // list
            .mockReturnValueOnce({
                from: async () => [
                    { weapon_id: "1", name: "Braton" },
                    { weapon_id: "2", name: "Braton Prime" },
                ],
            })
            // name lookup
            .mockReturnValueOnce({
                from: () => ({
                    where: async () => [
                        { weaponId: "1", name: "Braton", class: "normal" },
                        { weaponId: "2", name: "Braton", class: "prime" },
                    ],
                }),
            })

        const req = createReq({
            name: "Braton",
            class: "prime",
        })
        const res = createRes()

        await GET(req, res)

        expect(res.statusCode).toBe(200)
        expect(res.body.data.weapon.class).toBe("prime")
    })

    test("returns empty weapon when name resolution yields no single match", async () => {
        ;(db.select as any)
            // list
            .mockReturnValueOnce({
                from: async () => [
                    { weapon_id: "1", name: "Braton" },
                ],
            })
            // name lookup → multiple, but none match class
            .mockReturnValueOnce({
                from: () => ({
                    where: async () => [
                        { weaponId: "1", name: "Braton", class: "normal" },
                        { weaponId: "2", name: "Braton", class: "prime" },
                    ],
                }),
            })

        const req = createReq({
            name: "Braton",
            class: "wraith",
        })
        const res = createRes()

        await GET(req, res)

        expect(res.statusCode).toBe(200)
        expect(res.body.data.weapon).toMatchObject({
            weapon_id: null,
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
