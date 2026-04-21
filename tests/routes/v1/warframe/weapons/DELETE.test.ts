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
    },
}))

vi.mock("@services/dbService", () => ({
    __esModule: true,
    db: {
        delete: vi.fn(),
    },
}))

/**
 * ------------------------------------------------------------
 * IMPORTS (AFTER MOCKS)
 * ------------------------------------------------------------
 */

import DELETE from "@routes/v1/warframe/weapons/DELETE"
import { db } from "@services/dbService"

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

describe("DELETE /v1/warframe/weapons", () => {
    test("deletes a weapon by weapon_id and returns deleted record", async () => {
        ;(db.delete as any).mockReturnValueOnce({
            where: () => ({
                returning: async () => [
                    {
                        weaponId:
                            "880e8400-e29b-41d4-a716-446655440020",
                        name: "Braton",
                        type: "rifle",
                        damage: 35,
                    },
                ],
            }),
        })

        const req = createReq({
            weapon_id:
                "880e8400-e29b-41d4-a716-446655440020",
        })
        const res = createRes()

        await DELETE(req, res)

        expect(db.delete).toHaveBeenCalledOnce()
        expect(res.statusCode).toBe(200)
        expect(res.body.success).toBe(true)
        expect(res.body.data.name).toBe("Braton")
    })

    test("succeeds with null data when no matching weapon exists", async () => {
        ;(db.delete as any).mockReturnValueOnce({
            where: () => ({
                returning: async () => [],
            }),
        })

        const req = createReq({
            weapon_id: "nonexistent-id",
        })
        const res = createRes()

        await DELETE(req, res)

        expect(res.statusCode).toBe(200)
        expect(res.body.success).toBe(true)
        expect(res.body.data).toBeNull()
    })

    test("returns 400 when weapon_id is missing", async () => {
        const req = createReq({})
        const res = createRes()

        await DELETE(req, res)

        expect(res.statusCode).toBe(400)
        expect(res.body.success).toBe(false)
        expect(res.body.error).toContain("weapon_id is required")
    })

    test("returns 500 on unexpected errors", async () => {
        const consoleErrorSpy = vi
            .spyOn(console, "error")
            .mockImplementation(() => {})

        ;(db.delete as any).mockImplementationOnce(() => {
            throw new Error("boom")
        })

        const req = createReq({
            weapon_id: "1",
        })
        const res = createRes()

        await DELETE(req, res)

        expect(res.statusCode).toBe(500)
        expect(res.body).toEqual({
            success: false,
            error: "Internal server error",
        })

        consoleErrorSpy.mockRestore()
    })
})
