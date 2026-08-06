/**
 * @myDocBlock v2.3
 * @file PUT.test.ts
 * @internal
 * @module tests/routes/v1/config
 * @tag config, test
 * @version 1.1.0
 * @author william.r.oak@gmail.com
 * @path tests/routes/v1/config/PUT.test.ts
 * @summary Unit tests for PUT /v1/config route handler and upsert logic.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { Request, Response } from 'express'

const { mockSelect, mockInsert, mockUpdate } = vi.hoisted(() => ({
    mockSelect: vi.fn(),
    mockInsert: vi.fn(),
    mockUpdate: vi.fn(),
}))

vi.mock('@services/dbService', () => ({
    db: {
        select: mockSelect,
        insert: mockInsert,
        update: mockUpdate,
    },
}))

vi.mock('uuidv7', () => ({
    uuidv7: () => 'fixed-uuid',
}))

import PUT, { authRequired, schema, __test__ } from '@routes/v1/config/PUT'
import type { ConfigWriteRepository, ConfigRecord } from '@routes/v1/config/PUT'

const { upsertConfig } = __test__

function createMockReq(body: any): Request {
    return {
        body,
    } as unknown as Request
}

function createMockRes() {
    let statusCode = 200
    let jsonBody: any = null

    const statusSpy = vi.fn((code: number) => {
        statusCode = code
        return res
    })

    const jsonSpy = vi.fn((data: any) => {
        jsonBody = data
        return res
    })

    const res = {
        status: statusSpy,
        json: jsonSpy,
    } as unknown as Response

    return {
        res,
        statusSpy,
        jsonSpy,
        getStatusCode: () => statusCode,
        getJsonBody: () => jsonBody,
    }
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe('config PUT route metadata', () => {
    test('exports authRequired as true', () => {
        expect(authRequired).toBe(true)
    })

    test('schema validates body properly', () => {
        const valid = schema.body.safeParse({
            name: '  app_config  ',
            version: '  1.0.0  ',
            value: { key: 'value' },
        })
        expect(valid.success).toBe(true)
        if (valid.success) {
            expect(valid.data.name).toBe('app_config')
            expect(valid.data.version).toBe('1.0.0')
        }

        const invalid = schema.body.safeParse({
            name: '',
            version: '1.0.0',
        })
        expect(invalid.success).toBe(false)
    })
})

describe('config PUT upsert logic (unit)', () => {
    test('updates existing record when name+version exists', async () => {
        const existing: ConfigRecord = {
            id: 'existing-id',
            name: 'feature',
            version: '1.00',
            value: { enabled: true },
            createdAt: new Date('2026-01-01T00:00:00Z'),
            updatedAt: new Date('2026-01-01T00:00:00Z'),
        }

        const repo: ConfigWriteRepository = {
            findByNameVersion: vi.fn().mockResolvedValue(existing),
            insert: vi.fn(),
            update: vi.fn().mockResolvedValue({
                ...existing,
                value: { enabled: false },
                updatedAt: new Date('2026-02-01T00:00:00Z'),
            }),
        }

        const result = await upsertConfig(repo, {
            name: 'feature',
            version: '1.00',
            value: { enabled: false },
        })

        expect(repo.findByNameVersion).toHaveBeenCalledWith('feature', '1.00')
        expect(repo.update).toHaveBeenCalledWith('existing-id', { enabled: false })
        expect(repo.insert).not.toHaveBeenCalled()

        expect(result.id).toBe('existing-id')
        expect((result.value as any).enabled).toBe(false)
    })

    test('inserts new record when name+version does not exist', async () => {
        const inserted: ConfigRecord = {
            id: 'fixed-uuid',
            name: 'theme',
            version: '2.00',
            value: { dark: true },
            createdAt: new Date('2026-03-01T00:00:00Z'),
            updatedAt: new Date('2026-03-01T00:00:00Z'),
        }

        const repo: ConfigWriteRepository = {
            findByNameVersion: vi.fn().mockResolvedValue(null),
            insert: vi.fn().mockResolvedValue(inserted),
            update: vi.fn(),
        }

        const result = await upsertConfig(repo, {
            name: 'theme',
            version: '2.00',
            value: { dark: true },
        })

        expect(repo.findByNameVersion).toHaveBeenCalledWith('theme', '2.00')
        expect(repo.insert).toHaveBeenCalledWith({
            id: 'fixed-uuid',
            name: 'theme',
            version: '2.00',
            value: { dark: true },
        })
        expect(repo.update).not.toHaveBeenCalled()

        expect(result).toEqual(inserted)
    })
})

describe('PUT HTTP handler (integration / repository)', () => {
    test('returns 400 INVALID_REQUEST when request body is invalid', async () => {
        const { res, getStatusCode, getJsonBody } = createMockRes()
        const req = createMockReq({ name: '', version: '' })

        await PUT(req, res)

        expect(getStatusCode()).toBe(400)
        expect(getJsonBody()).toEqual({
            error: 'INVALID_REQUEST',
            message: 'Invalid request body',
        })
    })

    test('inserts new record when record does not exist in DB', async () => {
        const now = new Date()
        const mockRow = {
            id: 'fixed-uuid',
            name: 'setting',
            version: '1.0',
            value: { val: 42 },
            createdAt: now,
            updatedAt: now,
        }

        // First select (findByNameVersion) returns no rows -> null
        // Second select (insert reload) returns inserted row
        mockSelect
            .mockReturnValueOnce({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockReturnValue({
                        limit: vi.fn().mockResolvedValue([]),
                    }),
                }),
            })
            .mockReturnValueOnce({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockReturnValue({
                        limit: vi.fn().mockResolvedValue([mockRow]),
                    }),
                }),
            })

        mockInsert.mockReturnValue({
            values: vi.fn().mockResolvedValue([]),
        })

        const { res, getStatusCode, getJsonBody } = createMockRes()
        const req = createMockReq({
            name: 'setting',
            version: '1.0',
            value: { val: 42 },
        })

        await PUT(req, res)

        expect(getStatusCode()).toBe(200)
        expect(getJsonBody()).toEqual({
            id: 'fixed-uuid',
            name: 'setting',
            version: '1.0',
            value: { val: 42 },
            createdAt: now,
            updatedAt: now,
        })
    })

    test('updates existing record when record exists in DB', async () => {
        const now = new Date()
        const existingRow = {
            id: 'row-1',
            name: 'setting',
            version: '1.0',
            value: { val: 1 },
            createdAt: now,
            updatedAt: now,
        }
        const updatedRow = {
            ...existingRow,
            value: { val: 2 },
            updatedAt: now,
        }

        // First select (findByNameVersion) returns existing row
        // Second select (update reload) returns updated row
        mockSelect
            .mockReturnValueOnce({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockReturnValue({
                        limit: vi.fn().mockResolvedValue([existingRow]),
                    }),
                }),
            })
            .mockReturnValueOnce({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockReturnValue({
                        limit: vi.fn().mockResolvedValue([updatedRow]),
                    }),
                }),
            })

        mockUpdate.mockReturnValue({
            set: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([]),
            }),
        })

        const { res, getStatusCode, getJsonBody } = createMockRes()
        const req = createMockReq({
            name: 'setting',
            version: '1.0',
            value: { val: 2 },
        })

        await PUT(req, res)

        expect(getStatusCode()).toBe(200)
        expect(getJsonBody()).toEqual({
            id: 'row-1',
            name: 'setting',
            version: '1.0',
            value: { val: 2 },
            createdAt: now,
            updatedAt: now,
        })
    })

    test('returns 500 INTERNAL_ERROR when insert reload fails', async () => {
        // First select returns no rows
        // Second select (reload) returns no rows
        mockSelect
            .mockReturnValueOnce({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockReturnValue({
                        limit: vi.fn().mockResolvedValue([]),
                    }),
                }),
            })
            .mockReturnValueOnce({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockReturnValue({
                        limit: vi.fn().mockResolvedValue([]),
                    }),
                }),
            })

        mockInsert.mockReturnValue({
            values: vi.fn().mockResolvedValue([]),
        })

        const { res, getStatusCode, getJsonBody } = createMockRes()
        const req = createMockReq({
            name: 'setting',
            version: '1.0',
            value: { val: 42 },
        })

        await PUT(req, res)

        expect(getStatusCode()).toBe(500)
        expect(getJsonBody()).toEqual({
            error: 'INTERNAL_ERROR',
            message: 'Failed to upsert config record',
        })
    })

    test('returns 500 INTERNAL_ERROR when update reload fails', async () => {
        const now = new Date()
        const existingRow = {
            id: 'row-1',
            name: 'setting',
            version: '1.0',
            value: { val: 1 },
            createdAt: now,
            updatedAt: now,
        }

        // First select returns existing row
        // Second select (reload) returns no rows
        mockSelect
            .mockReturnValueOnce({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockReturnValue({
                        limit: vi.fn().mockResolvedValue([existingRow]),
                    }),
                }),
            })
            .mockReturnValueOnce({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockReturnValue({
                        limit: vi.fn().mockResolvedValue([]),
                    }),
                }),
            })

        mockUpdate.mockReturnValue({
            set: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([]),
            }),
        })

        const { res, getStatusCode, getJsonBody } = createMockRes()
        const req = createMockReq({
            name: 'setting',
            version: '1.0',
            value: { val: 2 },
        })

        await PUT(req, res)

        expect(getStatusCode()).toBe(500)
        expect(getJsonBody()).toEqual({
            error: 'INTERNAL_ERROR',
            message: 'Failed to upsert config record',
        })
    })

    test('returns 500 INTERNAL_ERROR when database throws error', async () => {
        mockSelect.mockImplementationOnce(() => {
            throw new Error('Database connection lost')
        })

        const { res, getStatusCode, getJsonBody } = createMockRes()
        const req = createMockReq({
            name: 'setting',
            version: '1.0',
            value: { val: 42 },
        })

        await PUT(req, res)

        expect(getStatusCode()).toBe(500)
        expect(getJsonBody()).toEqual({
            error: 'INTERNAL_ERROR',
            message: 'Failed to upsert config record',
        })
    })
})
