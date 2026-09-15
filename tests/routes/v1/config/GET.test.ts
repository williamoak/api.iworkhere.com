import { describe, test, expect, vi, beforeEach } from "vitest"
import type { Request, Response } from "express"

/* ------------------------------------------------------------------ */
/* Mocks                                                              */
/* ------------------------------------------------------------------ */

vi.mock("@services/dbService", async () => {
    const { createDbServiceMock } = await import('../../../helpers/dbMock');
    return createDbServiceMock();
})

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

import GET, { __test__ } from "@routes/v1/config/GET"
import { db } from "@services/dbService"

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

const repo = __test__.dbConfigRepository

beforeEach(() => {
    vi.clearAllMocks()
})

/* ------------------------------------------------------------------ */
/* Tests                                                              */
/* ------------------------------------------------------------------ */

describe("GET /v1/config", () => {
    test("returns all records when no query params are provided", async () => {
        vi.spyOn(repo, "getAll").mockResolvedValueOnce([
            { id: "1" } as any,
            { id: "2" } as any,
        ])

        const req = createReq({})
        const res = createRes()

        await GET(req, res)

        expect(res.statusCode).toBe(200)
        expect(res.body).toHaveLength(2)
        expect(repo.getAll).toHaveBeenCalledOnce()
    })

    test("returns a single record by id", async () => {
        vi.spyOn(repo, "getById").mockResolvedValueOnce({
            id: "abc",
            name: "test",
            version: "1.02",
        } as any)

        const req = createReq({ id: "abc" })
        const res = createRes()

        await GET(req, res)

        expect(res.statusCode).toBe(200)
        expect(res.body.id).toBe("abc")
        expect(repo.getById).toHaveBeenCalledOnce()
    })

    test("returns 404 when id does not exist", async () => {
        vi.spyOn(repo, "getById").mockResolvedValueOnce(null)

        const req = createReq({ id: "missing" })
        const res = createRes()

        await GET(req, res)

        expect(res.statusCode).toBe(404)
        expect(res.body.error).toBe("NOT_FOUND")
    })

    test("returns a single record by name + version", async () => {
        vi.spyOn(repo, "findByNameAndVersion").mockResolvedValueOnce([
            { id: "1", version: "1.03" } as any,
        ])

        const req = createReq({ name: "test", version: "1.03" })
        const res = createRes()

        await GET(req, res)

        expect(res.statusCode).toBe(200)
        expect(res.body.version).toBe("1.03")
    })

    test("returns 404 when name + version does not match", async () => {
        vi.spyOn(repo, "findByNameAndVersion").mockResolvedValueOnce([])

        const req = createReq({ name: "test", version: "9.99" })
        const res = createRes()

        await GET(req, res)

        expect(res.statusCode).toBe(404)
        expect(res.body.error).toBe("NOT_FOUND")
    })

    test("returns 409 when name and version matches multiple records", async () => {
        vi.spyOn(repo, "findByNameAndVersion").mockResolvedValueOnce([
            { id: "1", version: "1.00" } as any,
            { id: "2", version: "1.00" } as any,
        ])

        const req = createReq({ name: "test", version: "1.00" })
        const res = createRes()

        await GET(req, res)

        expect(res.statusCode).toBe(409)
        expect(res.body.error).toBe("CONFLICT")
    })

    test("returns 200 when name-only lookup finds exactly one record", async () => {
        vi.spyOn(repo, "findByName").mockResolvedValueOnce([
            { id: "1", name: "test", version: "1.00" } as any,
        ])

        const req = createReq({ name: "test" })
        const res = createRes()

        await GET(req, res)

        expect(res.statusCode).toBe(200)
        expect(res.body.id).toBe("1")
    })

    test("returns 404 when name-only lookup finds zero records", async () => {
        vi.spyOn(repo, "findByName").mockResolvedValueOnce([])

        const req = createReq({ name: "missing-name" })
        const res = createRes()

        await GET(req, res)

        expect(res.statusCode).toBe(404)
        expect(res.body.error).toBe("NOT_FOUND")
    })

    test("returns 409 when name-only lookup is ambiguous", async () => {
        vi.spyOn(repo, "findByName").mockResolvedValueOnce([
            { id: "1" } as any,
            { id: "2" } as any,
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

    describe("dbConfigRepository queries", () => {
        test("executes database queries in getById", async () => {
            vi.mocked(db.select).mockReturnValue({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockReturnValue({
                        limit: vi.fn().mockResolvedValue([
                            {
                                id: "uuid-1",
                                name: "config-key",
                                version: 1.0,
                                value: { setting: true },
                                createdAt: new Date(),
                                updatedAt: new Date(),
                            },
                        ]),
                    }),
                }),
            } as any)

            const rec = await repo.getById("uuid-1")
            expect(rec?.name).toBe("config-key")

            vi.mocked(db.select).mockReturnValue({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockReturnValue({
                        limit: vi.fn().mockResolvedValue([]),
                    }),
                }),
            } as any)

            const missing = await repo.getById("missing")
            expect(missing).toBeNull()
        })

        test("executes database queries in findByName", async () => {
            vi.mocked(db.select).mockReturnValue({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockReturnValue({
                        orderBy: vi.fn().mockResolvedValue([
                            { id: "1", name: "k", version: 1.0, value: {}, createdAt: new Date(), updatedAt: new Date() },
                        ]),
                    }),
                }),
            } as any)

            const list = await repo.findByName("k")
            expect(list).toHaveLength(1)
        })

        test("executes database queries in findByNameAndVersion", async () => {
            vi.mocked(db.select).mockReturnValue({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockReturnValue({
                        limit: vi.fn().mockResolvedValue([
                            { id: "1", name: "k", version: 1.0, value: {}, createdAt: new Date(), updatedAt: new Date() },
                        ]),
                    }),
                }),
            } as any)

            const list = await repo.findByNameAndVersion("k", "1.0")
            expect(list).toHaveLength(1)
        })

        test("executes database queries in getAll", async () => {
            vi.mocked(db.select).mockReturnValue({
                from: vi.fn().mockReturnValue({
                    orderBy: vi.fn().mockResolvedValue([
                        { id: "1", name: "k", version: 1.0, value: {}, createdAt: new Date(), updatedAt: new Date() },
                    ]),
                }),
            } as any)

            const list = await repo.getAll()
            expect(list).toHaveLength(1)
        })
    })
})
