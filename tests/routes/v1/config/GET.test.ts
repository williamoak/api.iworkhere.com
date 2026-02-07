/**
 * @myDocBlock v2.3
 * @file GET.test.ts
 * @internal
 * @module tests/routes/v1/config
 * @tag config, test
 * @version 1.1.0
 * @author william.r.oak@gmail.com
 * @path tests/routes/v1/config/GET.test.ts
 * @summary Unit tests for GET /v1/config (deterministic contract).
 *
 * @description
 * Verifies that GET /v1/config enforces strict identifier-based resolution:
 *   - returns all records when no query params are provided
 *   - returns a single record by id
 *   - returns a single record by name + version
 *   - rejects ambiguous name-only lookups
 *   - rejects version-only lookups
 *   - rejects invalid identifier combinations
 *
 * These tests are security-critical and must not regress.
 */

import { describe, test, expect, vi, beforeEach } from "vitest"
import type { Request, Response } from "express"

/* ------------------------------------------------------------------ */
/* Mocks                                                              */
/* ------------------------------------------------------------------ */

vi.mock("@services/dbService", () => ({
    db: {},
}))

vi.mock("@db/schema/config", () => ({
    configTable: {
        id: "id",
        name: "name",
        version: "version",
        value: "value",
        createdAt: "createdAt",
        updatedAt: "updatedAt",
    },
}))

/* ------------------------------------------------------------------ */
/* Imports                                                            */
/* ------------------------------------------------------------------ */

import GET from "@routes/v1/config/GET"

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function createReq(query: Record<string, unknown>): Request {
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
    }

    return res as unknown as ResMock
}

/* ------------------------------------------------------------------ */
/* Repository spy injection                                           */
/* ------------------------------------------------------------------ */

const repoSpy = {
    getById: vi.fn(),
    findByName: vi.fn(),
    findByNameAndVersion: vi.fn(),
    getAll: vi.fn(),
}

vi.mock("@routes/v1/config/GET", async (importOriginal) => {
    const actual = await importOriginal<any>()

    return {
        ...actual,
        __test__: actual.__test__,
        default: async (req: Request, res: Response) => {
            // Patch repository at runtime
            actual.__test__.dbConfigRepository.getById = repoSpy.getById
            actual.__test__.dbConfigRepository.findByName =
                repoSpy.findByName
            actual.__test__.dbConfigRepository.findByNameAndVersion =
                repoSpy.findByNameAndVersion
            actual.__test__.dbConfigRepository.getAll = repoSpy.getAll

            return actual.default(req, res)
        },
    }
})

beforeEach(() => {
    vi.resetAllMocks()
})

/* ------------------------------------------------------------------ */
/* Tests                                                              */
/* ------------------------------------------------------------------ */

describe("GET /v1/config", () => {
    test("returns all records when no query params are provided", async () => {
        repoSpy.getAll.mockResolvedValueOnce([
            { id: "1" },
            { id: "2" },
        ])

        const req = createReq({})
        const res = createRes()

        await GET(req, res)

        expect(res.statusCode).toBe(200)
        expect(res.body).toHaveLength(2)
        expect(repoSpy.getAll).toHaveBeenCalledOnce()
    })

    test("returns a single record by id", async () => {
        repoSpy.getById.mockResolvedValueOnce({
            id: "abc",
            name: "test",
            version: "1.02",
        })

        const req = createReq({ id: "abc" })
        const res = createRes()

        await GET(req, res)

        expect(res.statusCode).toBe(200)
        expect(res.body.id).toBe("abc")
        expect(repoSpy.getById).toHaveBeenCalledOnce()
    })

    test("returns 404 when id does not exist", async () => {
        repoSpy.getById.mockResolvedValueOnce(null)

        const req = createReq({ id: "missing" })
        const res = createRes()

        await GET(req, res)

        expect(res.statusCode).toBe(404)
        expect(res.body.error).toBe("NOT_FOUND")
    })

    test("returns a single record by name + version", async () => {
        repoSpy.findByNameAndVersion.mockResolvedValueOnce([
            { id: "1", version: "1.03" },
        ])

        const req = createReq({ name: "test", version: "1.03" })
        const res = createRes()

        await GET(req, res)

        expect(res.statusCode).toBe(200)
        expect(res.body.version).toBe("1.03")
    })

    test("returns 404 when name + version does not match", async () => {
        repoSpy.findByNameAndVersion.mockResolvedValueOnce([])

        const req = createReq({ name: "test", version: "9.99" })
        const res = createRes()

        await GET(req, res)

        expect(res.statusCode).toBe(404)
        expect(res.body.error).toBe("NOT_FOUND")
    })

    test("returns 409 when name-only lookup is ambiguous", async () => {
        repoSpy.findByName.mockResolvedValueOnce([
            { id: "1" },
            { id: "2" },
        ])

        const req = createReq({ name: "test" })
        const res = createRes()

        await GET(req, res)

        expect(res.statusCode).toBe(409)
        expect(res.body.error).toBe("CONFLICT")
    })

    test("returns 400 when version is provided without name", async () => {
        const req = createReq({ version: "1.02" })
        const res = createRes()

        await GET(req, res)

        expect(res.statusCode).toBe(400)
        expect(res.body.error).toBe("INVALID_REQUEST")
    })

    test("returns 400 when id is combined with name or version", async () => {
        const req = createReq({
            id: "abc",
            name: "test",
        })
        const res = createRes()

        await GET(req, res)

        expect(res.statusCode).toBe(400)
        expect(res.body.error).toBe("INVALID_REQUEST")
    })
})
