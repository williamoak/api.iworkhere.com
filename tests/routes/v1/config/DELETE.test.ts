/**
 * @myDocBlock v2.3
 * @file DELETE.test.ts
 * @internal
 * @module tests/routes/v1/config
 * @tag config, test
 * @version 1.1.0
 * @author william.r.oak@gmail.com
 * @path tests/routes/v1/config/DELETE.test.ts
 * @summary Contract tests for DELETE /v1/config.
 *
 * @description
 * Verifies deterministic delete semantics:
 *   - delete by uuid
 *   - delete by name + version
 *   - delete by name only when unique
 *   - reject ambiguous or invalid identifier combinations
 *
 * These tests are security-critical.
 */

import { describe, test, expect, vi, beforeEach } from "vitest"
import type { Request, Response } from "express"

/* ------------------------------------------------------------------ */
/* Mocks                                                              */
/* ------------------------------------------------------------------ */

vi.mock("@services/dbService", () => ({
    __esModule: true,
    db: {},
}))

vi.mock("@db/schema/config", () => ({
    __esModule: true,
    configTable: {
        id: "id",
        name: "name",
        version: "version",
    },
}))

/* ------------------------------------------------------------------ */
/* Imports                                                            */
/* ------------------------------------------------------------------ */

import DELETE, { __test__ } from "@routes/v1/config/DELETE"

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function createReq(validatedQuery: Record<string, unknown>): Request {
    return {
        validated: {
            query: validatedQuery,
        },
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
    }

    return res as unknown as ResMock
}

const repo = __test__.dbConfigDeleteRepository

beforeEach(() => {
    vi.clearAllMocks()
})

/* ------------------------------------------------------------------ */
/* Tests                                                              */
/* ------------------------------------------------------------------ */

describe("DELETE /v1/config", () => {
    test("deletes by uuid", async () => {
        vi.spyOn(repo, "deleteById").mockResolvedValueOnce(true)

        const req = createReq({ uuid: "valid-uuid" })
        const res = createRes()

        await DELETE(req, res)

        expect(repo.deleteById).toHaveBeenCalledWith("valid-uuid")
        expect(res.statusCode).toBe(200)
        expect(res.body).toEqual({ success: true })
    })

    test("returns 404 when uuid does not exist", async () => {
        vi.spyOn(repo, "deleteById").mockResolvedValueOnce(false)

        const req = createReq({ uuid: "missing-uuid" })
        const res = createRes()

        await DELETE(req, res)

        expect(res.statusCode).toBe(404)
        expect(res.body).toEqual({
            error: "NOT_FOUND",
            message: "Config record not found",
        })
    })

    test("deletes by name + version", async () => {
        vi.spyOn(repo, "findByNameAndVersion").mockResolvedValueOnce([
            { id: "record-id" },
        ])
        vi.spyOn(repo, "deleteById").mockResolvedValueOnce(true)

        const req = createReq({ name: "test", version: "1.02" })
        const res = createRes()

        await DELETE(req, res)

        expect(repo.findByNameAndVersion).toHaveBeenCalledWith("test", "1.02")
        expect(repo.deleteById).toHaveBeenCalledWith("record-id")
        expect(res.statusCode).toBe(200)
        expect(res.body).toEqual({ success: true })
    })

    test("returns 409 when name + version matches multiple records", async () => {
        vi.spyOn(repo, "findByNameAndVersion").mockResolvedValueOnce([
            { id: "a" },
            { id: "b" },
        ])

        const req = createReq({ name: "test", version: "1.02" })
        const res = createRes()

        await DELETE(req, res)

        expect(res.statusCode).toBe(409)
        expect(res.body.error).toBe("CONFLICT")
    })

    test("deletes by name only when unique", async () => {
        vi.spyOn(repo, "findByName").mockResolvedValueOnce([
            { id: "unique-id" },
        ])
        vi.spyOn(repo, "deleteById").mockResolvedValueOnce(true)

        const req = createReq({ name: "unique" })
        const res = createRes()

        await DELETE(req, res)

        expect(repo.findByName).toHaveBeenCalledWith("unique")
        expect(repo.deleteById).toHaveBeenCalledWith("unique-id")
        expect(res.statusCode).toBe(200)
        expect(res.body).toEqual({ success: true })
    })

    test("returns 409 when name-only delete is ambiguous", async () => {
        vi.spyOn(repo, "findByName").mockResolvedValueOnce([
            { id: "a" },
            { id: "b" },
        ])

        const req = createReq({ name: "test" })
        const res = createRes()

        await DELETE(req, res)

        expect(res.statusCode).toBe(409)
        expect(res.body.error).toBe("CONFLICT")
    })

    test("returns 400 when version is provided without name", async () => {
        const req = createReq({ version: "1.02" })
        const res = createRes()

        await DELETE(req, res)

        expect(res.statusCode).toBe(400)
        expect(res.body.error).toBe("INVALID_REQUEST")
    })

    test("returns 400 when uuid is combined with name", async () => {
        const req = createReq({
            uuid: "uuid",
            name: "test",
        })
        const res = createRes()

        await DELETE(req, res)

        expect(res.statusCode).toBe(400)
        expect(res.body.error).toBe("INVALID_REQUEST")
    })

    test("returns 400 when no identifier is provided", async () => {
        const req = createReq({})
        const res = createRes()

        await DELETE(req, res)

        expect(res.statusCode).toBe(400)
        expect(res.body.error).toBe("INVALID_REQUEST")
    })
})
