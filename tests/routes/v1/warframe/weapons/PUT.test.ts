import { describe, test, expect, vi, beforeEach } from "vitest"
import type { Request, Response } from "express"

/**
 * ------------------------------------------------------------
 * MOCKS
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
        insert: vi.fn(),
        update: vi.fn(),
    },
}))

vi.mock("@src/validation/weapon", () => ({
    weaponInsertSchema: { parse: vi.fn(v => v) },
    weaponUpdateSchema: { parse: vi.fn(v => v) },
    weaponUpdateByNameSchema: { parse: vi.fn(v => v) },
}))

vi.mock("@src/db/mappers/weaponWrite", () => ({
    toWeaponWrite: vi.fn(v => v),
}))

vi.mock("@src/dto/weapon", () => ({
    emptyWeapon: vi.fn(() => ({})),
    toWeaponDTO: vi.fn(row => row),
}))

vi.mock("@src/dto/dtoOverlay", () => ({
    overlayDto: vi.fn(() => ({
        merged: {},
        providedFields: new Set(),
    })),
}))

/**
 * ------------------------------------------------------------
 * IMPORTS
 * ------------------------------------------------------------
 */

import PUT from "@routes/v1/warframe/weapons/PUT"
import { db } from "@services/dbService"

/**
 * ------------------------------------------------------------
 * HELPERS
 * ------------------------------------------------------------
 */

function createReq(body: any): Request {
    return { body } as unknown as Request
}

type ResMock = Response & { statusCode: number; body?: any }

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
    }
    return res as unknown as ResMock
}

beforeEach(() => {
    vi.resetAllMocks()
})

/**
 * ------------------------------------------------------------
 * TESTS
 * ------------------------------------------------------------
 */

describe("PUT /v1/warframe/weapons", () => {
    test("updates a weapon when weapon_id is provided", async () => {
        ;(db.update as any).mockReturnValueOnce({
            set: () => ({
                where: () => ({
                    returning: async () => [
                        { weaponId: "1", name: "Braton", damage: 35 },
                    ],
                }),
            }),
        })

        const req = createReq({ weapon_id: "1", damage: 40 })
        const res = createRes()

        await PUT(req, res)

        expect(res.statusCode).toBe(200)
        expect(res.body.success).toBe(true)
        expect(res.body.data.damage).toBe(35)
    })

    test("inserts a weapon when name resolves to zero records", async () => {
        ;(db.select as any).mockReturnValueOnce({
            from: () => ({ where: async () => [] }),
        })

        ;(db.insert as any).mockReturnValueOnce({
            values: () => ({
                returning: async () => [
                    { weaponId: "2", name: "Braton", class: "normal" },
                ],
            }),
        })

        const req = createReq({ name: "Braton", damage: 35 })
        const res = createRes()

        await PUT(req, res)

        expect(res.statusCode).toBe(200)
        expect(res.body.data.class).toBe("normal")
    })

    test("returns 409 when multiple weapons match name and class", async () => {
        ;(db.select as any).mockReturnValueOnce({
            from: () => ({
                where: async () => [
                    { weaponId: "1", class: "normal" },
                    { weaponId: "2", class: "normal" },
                ],
            }),
        })

        const req = createReq({ name: "Braton", class: "normal" })
        const res = createRes()

        await PUT(req, res)

        expect(res.statusCode).toBe(409)
        expect(res.body.success).toBe(false)
        expect(res.body.error).toContain("Multiple weapons")
    })
})
