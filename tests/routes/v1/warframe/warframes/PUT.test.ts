/**
 * @myDocBlock v2.3
 * @file PUT.test.ts
 * @internal
 * @module tests/routes/v1/warframe/warframes
 * @tag warframe, warframes, test
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path tests/routes/v1/warframe/warframes/PUT.test.ts
 * @summary Unit tests for PUT /v1/warframe/warframes endpoint glue logic.
 * @description
 * Verifies that PUT /v1/warframe/warframes:
 *   - updates by warframe_id with highest priority
 *   - inserts when name resolves to zero matches
 *   - returns 409 when name + class resolution is ambiguous
 *   - returns validation errors for invalid payloads
 *   - returns 500 on unexpected errors
 *
 * @query
 * none
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
 *     "routes/v1/warframe/warframes/PUT"
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

vi.mock("@src/validation/warframe", () => ({
    warframeInsertSchema: {
        parse: vi.fn(v => v),
    },
    warframeUpdateSchema: {
        parse: vi.fn(v => v),
    },
    warframeUpdateByNameSchema: {
        parse: vi.fn(v => v),
    },
}))

vi.mock("@src/db/mappers/warframeWrite", () => ({
    toWarframeWrite: vi.fn(v => v),
}))

vi.mock("@src/dto/warframe", () => ({
    emptyWarframe: vi.fn(() => ({})),
    toWarframeDTO: vi.fn(row => row),
}))

vi.mock("@src/dto/dtoOverlay", () => ({
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

import PUT from "@routes/v1/warframe/warframes/PUT"
import { db } from "@services/dbService"

/**
 * ------------------------------------------------------------
 * HELPERS
 * ------------------------------------------------------------
 */

function createReq(body: any): Request {
    return {
        body,
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

describe("PUT /v1/warframe/warframes", () => {
    test("updates a warframe when warframe_id is provided", async () => {
        ;(db.update as any).mockReturnValueOnce({
            set: () => ({
                where: () => ({
                    returning: async () => [
                        {
                            warframeId: "1",
                            name: "Excalibur",
                            class: "normal",
                        },
                    ],
                }),
            }),
        })

        const req = createReq({
            warframe_id: "1",
            name: "Excalibur",
            base_health: 120,
        })
        const res = createRes()

        await PUT(req, res)

        expect(db.update).toHaveBeenCalledOnce()
        expect(res.statusCode).toBe(200)
        expect(res.body.success).toBe(true)
        expect(res.body.data.name).toBe("Excalibur")
    })

    test("inserts a warframe when name resolves to zero records", async () => {
        ;(db.select as any).mockReturnValueOnce({
            from: () => ({
                where: async () => [],
            }),
        })

        ;(db.insert as any).mockReturnValueOnce({
            values: () => ({
                returning: async () => [
                    {
                        warframeId: "2",
                        name: "Mag",
                        class: "normal",
                    },
                ],
            }),
        })

        const req = createReq({
            name: "Mag",
            base_health: 80,
            base_shield: 150,
        })
        const res = createRes()

        await PUT(req, res)

        expect(db.select).toHaveBeenCalledOnce()
        expect(db.insert).toHaveBeenCalledOnce()
        expect(res.statusCode).toBe(200)
        expect(res.body.success).toBe(true)
        expect(res.body.data.class).toBe("normal")
    })

    test("returns 409 when multiple warframes match name and class", async () => {
        ;(db.select as any).mockReturnValueOnce({
            from: () => ({
                where: async () => [
                    { warframeId: "1", class: "normal" },
                    { warframeId: "2", class: "normal" },
                ],
            }),
        })

        const req = createReq({
            name: "Excalibur",
            class: "normal",
        })
        const res = createRes()

        await PUT(req, res)

        expect(res.statusCode).toBe(409)
        expect(res.body.success).toBe(false)
        expect(res.body.error).toContain("Multiple warframes")
    })

    test("returns 500 on unexpected errors", async () => {
        const consoleErrorSpy = vi
            .spyOn(console, "error")
            .mockImplementation(() => {})

        ;(db.update as any).mockImplementationOnce(() => {
            throw new Error("boom")
        })

        const req = createReq({
            warframe_id: "1",
        })
        const res = createRes()

        await PUT(req, res)

        expect(res.statusCode).toBe(500)
        expect(res.body).toEqual({
            success: false,
            error: "Internal server error",
        })

        consoleErrorSpy.mockRestore()
    })
})
