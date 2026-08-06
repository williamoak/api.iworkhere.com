import { describe, test, expect, vi, beforeEach } from "vitest"
import type { Request, Response } from "express"
import { z } from "zod"

/**
 * ------------------------------------------------------------
 * MOCKS
 * ------------------------------------------------------------
 */

vi.mock("@helpers/logger", () => ({
    logger: {
        log: vi.fn(),
        error: vi.fn(),
    },
}))

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
    emptyWeapon: { weapon_id: "", name: "", class: "", description: "" },
    toWeaponDTO: vi.fn(row => row),
}))

vi.mock("@src/dto/dtoOverlay", () => ({
    overlayDto: vi.fn((empty, body) => {
        const merged = { ...empty, ...body }
        const providedFields = new Set(Object.keys(body ?? {}))
        return { merged, providedFields }
    }),
}))

/**
 * ------------------------------------------------------------
 * IMPORTS
 * ------------------------------------------------------------
 */

import PUT from "@routes/v1/warframe/weapons/PUT"
import { db } from "@services/dbService"
import { weaponUpdateSchema, weaponInsertSchema } from "@src/validation/weapon"
import { toWeaponWrite } from "@src/db/mappers/weaponWrite"

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
    vi.clearAllMocks()
})

/**
 * ------------------------------------------------------------
 * TESTS
 * ------------------------------------------------------------
 */

describe("PUT /v1/warframe/weapons", () => {
    describe("UPDATE by weapon_id", () => {
        test("updates a weapon when weapon_id is provided and fields exist", async () => {
            ;(db.update as any).mockReturnValueOnce({
                set: () => ({
                    where: () => ({
                        returning: async () => [
                            { weaponId: "1", name: "Braton", damage: 35 },
                        ],
                    }),
                }),
            })

            const req = createReq({ weapon_id: "1", damage: 35 })
            const res = createRes()

            await PUT(req, res)

            expect(res.statusCode).toBe(200)
            expect(res.body.success).toBe(true)
            expect(res.body.data.damage).toBe(35)
        })

        test("returns null data when DB update returns no rows for weapon_id", async () => {
            ;(db.update as any).mockReturnValueOnce({
                set: () => ({
                    where: () => ({
                        returning: async () => [],
                    }),
                }),
            })

            const req = createReq({ weapon_id: "999", damage: 35 })
            const res = createRes()

            await PUT(req, res)

            expect(res.statusCode).toBe(200)
            expect(res.body.success).toBe(true)
            expect(res.body.data).toBeNull()
        })

        test("returns 400 when weapon_id update has no writable fields", async () => {
            ;(toWeaponWrite as any).mockReturnValueOnce({})

            const req = createReq({ weapon_id: "1" })
            const res = createRes()

            await PUT(req, res)

            expect(res.statusCode).toBe(400)
            expect(res.body.success).toBe(false)
            expect(res.body.error).toBe("No fields provided to update")
        })
    })

    describe("UPDATE / INSERT by name", () => {
        test("inserts a weapon when name resolves to zero records (default class normal)", async () => {
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

        test("updates a weapon when name resolves to exactly 1 record", async () => {
            ;(db.select as any).mockReturnValueOnce({
                from: () => ({
                    where: async () => [
                        { weaponId: "w1", name: "Braton", class: "primary" },
                    ],
                }),
            })

            ;(db.update as any).mockReturnValueOnce({
                set: () => ({
                    where: () => ({
                        returning: async () => [
                            { weaponId: "w1", name: "Braton", damage: 50 },
                        ],
                    }),
                }),
            })

            const req = createReq({ name: "Braton", damage: 50 })
            const res = createRes()

            await PUT(req, res)

            expect(res.statusCode).toBe(200)
            expect(res.body.data.damage).toBe(50)
        })

        test("returns 400 when name matches 1 record but no writable fields provided", async () => {
            ;(db.select as any).mockReturnValueOnce({
                from: () => ({
                    where: async () => [
                        { weaponId: "w1", name: "Braton", class: "primary" },
                    ],
                }),
            })

            ;(toWeaponWrite as any).mockReturnValueOnce({})

            const req = createReq({ name: "Braton" })
            const res = createRes()

            await PUT(req, res)

            expect(res.statusCode).toBe(400)
            expect(res.body.error).toBe("No fields provided to update")
        })

        test("inserts a weapon when 2+ name matches exist but 0 match specified class", async () => {
            ;(db.select as any).mockReturnValueOnce({
                from: () => ({
                    where: async () => [
                        { weaponId: "1", class: "secondary" },
                        { weaponId: "2", class: "melee" },
                    ],
                }),
            })

            ;(db.insert as any).mockReturnValueOnce({
                values: () => ({
                    returning: async () => [
                        { weaponId: "3", name: "Braton", class: "primary" },
                    ],
                }),
            })

            const req = createReq({ name: "Braton", class: "primary" })
            const res = createRes()

            await PUT(req, res)

            expect(res.statusCode).toBe(200)
            expect(res.body.data.class).toBe("primary")
        })

        test("updates a weapon when 2+ name matches exist and exactly 1 matches specified class", async () => {
            ;(db.select as any).mockReturnValueOnce({
                from: () => ({
                    where: async () => [
                        { weaponId: "1", class: "secondary" },
                        { weaponId: "2", class: "primary" },
                    ],
                }),
            })

            ;(db.update as any).mockReturnValueOnce({
                set: () => ({
                    where: () => ({
                        returning: async () => [
                            { weaponId: "2", name: "Braton", class: "primary", damage: 60 },
                        ],
                    }),
                }),
            })

            const req = createReq({ name: "Braton", class: "primary", damage: 60 })
            const res = createRes()

            await PUT(req, res)

            expect(res.statusCode).toBe(200)
            expect(res.body.data.damage).toBe(60)
        })

        test("returns 400 when 2+ name matches, 1 class match, but no writable fields provided", async () => {
            ;(db.select as any).mockReturnValueOnce({
                from: () => ({
                    where: async () => [
                        { weaponId: "1", class: "secondary" },
                        { weaponId: "2", class: "primary" },
                    ],
                }),
            })

            ;(toWeaponWrite as any).mockReturnValueOnce({})

            const req = createReq({ name: "Braton", class: "primary" })
            const res = createRes()

            await PUT(req, res)

            expect(res.statusCode).toBe(400)
            expect(res.body.error).toBe("No fields provided to update")
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
            expect(res.body.error).toContain("Multiple weapons match name and class")
        })
    })

    describe("INSERT without weapon_id or name", () => {
        test("handles null or undefined request body gracefully", async () => {
            ;(db.insert as any).mockReturnValueOnce({
                values: () => ({
                    returning: async () => [
                        { weaponId: "w_def", class: "primary" },
                    ],
                }),
            })

            const req = createReq(undefined)
            const res = createRes()

            await PUT(req, res)

            expect(res.statusCode).toBe(200)
            expect(res.body.data.weaponId).toBe("w_def")
        })

        test("inserts a new weapon when neither weapon_id nor name is provided", async () => {
            ;(db.insert as any).mockReturnValueOnce({
                values: () => ({
                    returning: async () => [
                        { weaponId: "w_new", class: "primary", description: "New weapon" },
                    ],
                }),
            })

            const req = createReq({ class: "primary", description: "New weapon" })
            const res = createRes()

            await PUT(req, res)

            expect(res.statusCode).toBe(200)
            expect(res.body.data.weaponId).toBe("w_new")
        })
    })

    describe("ERROR HANDLING", () => {
        test("handles ZodError when request body is null or undefined", async () => {
            ;(weaponInsertSchema.parse as any).mockImplementationOnce(() => {
                throw new z.ZodError([])
            })

            const req = createReq(undefined)
            const res = createRes()

            await PUT(req, res)

            expect(res.statusCode).toBe(400)
            expect(res.body.error).toBe("Validation failed")
        })

        test("handles ZodError validation failure with missing and empty fields", async () => {
            ;(weaponUpdateSchema.parse as any).mockImplementationOnce(() => {
                throw new z.ZodError([
                    {
                        code: z.ZodIssueCode.custom,
                        message: "Invalid field",
                        path: ["name"],
                    },
                ])
            })

            const req = createReq({ weapon_id: "1", class: "" })
            const res = createRes()

            await PUT(req, res)

            expect(res.statusCode).toBe(400)
            expect(res.body.success).toBe(false)
            expect(res.body.error).toBe("Validation failed")
            expect(res.body.details).toHaveLength(1)
            expect(res.body.missing_fields).toBeDefined()
            expect(res.body.empty_fields).toContain("class")
        })

        test("handles internal server error (e.g. database error)", async () => {
            ;(weaponUpdateSchema.parse as any).mockImplementationOnce(() => {
                throw new Error("Database error")
            })

            const req = createReq({ weapon_id: "1" })
            const res = createRes()

            await PUT(req, res)

            expect(res.statusCode).toBe(500)
            expect(res.body.success).toBe(false)
            expect(res.body.error).toBe("Internal server error")
        })
    })
})
