/**
 * @myDocBlock
 * @file GET.test.ts
 * @test
 * @module tests/routes/v1/clients/joinaunion/visit_info/config
 * @tag clients, joinaunion, visit_info, config, tests
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path tests/routes/v1/clients/joinaunion/visit_info/config/GET.test.ts
 * @summary Unit and integration tests for GET /v1/clients/joinaunion/visit_info/config
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

const { mockSelectDistinct, mockFrom, mockWhere, mockOrderBy } = vi.hoisted(() => ({
    mockSelectDistinct: vi.fn(),
    mockFrom: vi.fn(),
    mockWhere: vi.fn(),
    mockOrderBy: vi.fn(),
}));

vi.mock('@services/dbService', async () => {
    const { createDbServiceMock } = await import('../../../../../../helpers/dbMock');
    mockSelectDistinct.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ orderBy: mockOrderBy });
    return createDbServiceMock({
        selectDistinct: mockSelectDistinct,
    });
});

import GET, {
    authRequired,
    ALLOWED_COLUMN_NAMES,
    COLUMN_MAP,
    defaultColumnQueryRepository,
    makeGetConfigHandler,
    __test__,
} from '@routes/v1/clients/joinaunion/visit_info/config/GET';

type ResMock = Response & {
    statusCode: number;
    body: unknown;
};

function createReq(query: Record<string, unknown> = {}): Request {
    return {
        query,
    } as unknown as Request;
}

function createRes(): ResMock {
    const res: Partial<ResMock> = {
        statusCode: 200,
        body: undefined,
    };
    res.status = vi.fn().mockImplementation((code: number) => {
        res.statusCode = code;
        return res;
    });
    res.json = vi.fn().mockImplementation((data: unknown) => {
        res.body = data;
        return res;
    });
    return res as ResMock;
}

describe('GET /v1/clients/joinaunion/visit_info/config', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSelectDistinct.mockReturnValue({ from: mockFrom });
        mockFrom.mockReturnValue({ where: mockWhere });
        mockWhere.mockReturnValue({ orderBy: mockOrderBy });
    });

    describe('Route configuration', () => {
        it('requires authentication', () => {
            expect(authRequired).toBe(true);
        });

        it('defines allowed column names', () => {
            expect(ALLOWED_COLUMN_NAMES).toContain('city');
            expect(ALLOWED_COLUMN_NAMES).toContain('country');
            expect(ALLOWED_COLUMN_NAMES).toContain('region');
            expect(ALLOWED_COLUMN_NAMES).toContain('location_source');
            expect(ALLOWED_COLUMN_NAMES).toContain('device_id');
            expect(ALLOWED_COLUMN_NAMES).toContain('user_id');
            expect(ALLOWED_COLUMN_NAMES).toContain('note');
        });
    });

    describe('Validation', () => {
        it('returns 400 when column parameter is missing', async () => {
            const req = createReq({});
            const res = createRes();

            await GET(req, res);

            expect(res.statusCode).toBe(400);
            expect(res.body).toEqual({
                error: 'INVALID_REQUEST',
                message: 'A valid column parameter is required',
            });
        });

        it('returns 400 when column parameter is empty string', async () => {
            const req = createReq({ column: '   ' });
            const res = createRes();

            await GET(req, res);

            expect(res.statusCode).toBe(400);
            expect(res.body).toEqual({
                error: 'INVALID_REQUEST',
                message: 'A valid column parameter is required',
            });
        });

        it('returns 400 when column parameter is an invalid column name', async () => {
            const req = createReq({ column: 'non_existent_column' });
            const res = createRes();

            await GET(req, res);

            expect(res.statusCode).toBe(400);
            expect(res.body).toEqual({
                error: 'INVALID_REQUEST',
                message: expect.stringContaining("Invalid column name: 'non_existent_column'"),
            });
        });
    });

    describe('Successful queries', () => {
        it('returns unique values for a valid column (city)', async () => {
            const mockRepo = {
                getUniqueValues: vi.fn().mockResolvedValue(['Calgary', 'Edmonton', 'Toronto', 'Vancouver']),
            };
            const handler = makeGetConfigHandler(mockRepo);

            const req = createReq({ column: 'city' });
            const res = createRes();

            await handler(req, res);

            expect(res.statusCode).toBe(200);
            expect(mockRepo.getUniqueValues).toHaveBeenCalledWith('city');
            expect(res.body).toMatchObject({
                column: 'city',
                unique_list: ['Calgary', 'Edmonton', 'Toronto', 'Vancouver'],
            });
            expect(typeof (res.body as { query_date: string }).query_date).toBe('string');
            expect(new Date((res.body as { query_date: string }).query_date).getTime()).toBeGreaterThan(0);
        });

        it('supports snake_case and camelCase column aliases', async () => {
            const mockRepo = {
                getUniqueValues: vi.fn().mockResolvedValue(['ip_centroid', 'testrun']),
            };
            const handler = makeGetConfigHandler(mockRepo);

            const req1 = createReq({ column: 'location_source' });
            const res1 = createRes();
            await handler(req1, res1);

            expect(res1.statusCode).toBe(200);
            expect(mockRepo.getUniqueValues).toHaveBeenCalledWith('locationSource');
            expect(res1.body).toMatchObject({
                column: 'location_source',
                unique_list: ['ip_centroid', 'testrun'],
            });

            const req2 = createReq({ column: 'locationSource' });
            const res2 = createRes();
            await handler(req2, res2);

            expect(res2.statusCode).toBe(200);
            expect(mockRepo.getUniqueValues).toHaveBeenCalledWith('locationSource');
        });

        it('accepts query fallback parameters (name or col)', async () => {
            const mockRepo = {
                getUniqueValues: vi.fn().mockResolvedValue(['CA', 'US']),
            };
            const handler = makeGetConfigHandler(mockRepo);

            const req = createReq({ name: 'country' });
            const res = createRes();

            await handler(req, res);

            expect(res.statusCode).toBe(200);
            expect(mockRepo.getUniqueValues).toHaveBeenCalledWith('country');
            expect(res.body).toMatchObject({
                column: 'country',
                unique_list: ['CA', 'US'],
            });
        });

        it('handles array-based query parameters (req.query.column as array)', async () => {
            const mockRepo = {
                getUniqueValues: vi.fn().mockResolvedValue(['Ontario', 'Quebec']),
            };
            const handler = makeGetConfigHandler(mockRepo);

            const req = createReq({ column: ['region', 'other'] });
            const res = createRes();

            await handler(req, res);

            expect(res.statusCode).toBe(200);
            expect(mockRepo.getUniqueValues).toHaveBeenCalledWith('region');
        });
    });

    describe('Error handling', () => {
        it('returns 500 when repository query throws an error', async () => {
            const mockRepo = {
                getUniqueValues: vi.fn().mockRejectedValue(new Error('Database query failure')),
            };
            const handler = makeGetConfigHandler(mockRepo);

            const req = createReq({ column: 'city' });
            const res = createRes();

            await handler(req, res);

            expect(res.statusCode).toBe(500);
            expect(res.body).toEqual({
                error: 'INTERNAL_ERROR',
                message: 'Failed to retrieve unique column values',
            });
        });
    });

    describe('defaultColumnQueryRepository', () => {
        it('queries Drizzle with selectDistinct, isNotNull, and asc sorting', async () => {
            mockOrderBy.mockResolvedValue([
                { value: 'Calgary' },
                { value: 'Toronto' },
                { value: null },
            ]);

            const result = await defaultColumnQueryRepository.getUniqueValues('city');

            expect(mockSelectDistinct).toHaveBeenCalled();
            expect(mockFrom).toHaveBeenCalled();
            expect(mockWhere).toHaveBeenCalled();
            expect(mockOrderBy).toHaveBeenCalled();
            expect(result).toEqual(['Calgary', 'Toronto']);
        });

        it('converts Date instances to ISO strings', async () => {
            const testDate = new Date('2026-09-28T12:00:00.000Z');
            mockOrderBy.mockResolvedValue([
                { value: testDate },
            ]);

            const result = await defaultColumnQueryRepository.getUniqueValues('touchTime');

            expect(result).toEqual(['2026-09-28T12:00:00.000Z']);
        });

        it('throws if an invalid column key is somehow passed to repository', async () => {
            await expect(
                defaultColumnQueryRepository.getUniqueValues('invalidColumnKey' as any),
            ).rejects.toThrow('Invalid column key');
        });
    });

    describe('Test exports', () => {
        it('exports internal constants and functions on __test__', () => {
            expect(__test__.COLUMN_MAP).toBe(COLUMN_MAP);
            expect(__test__.ALLOWED_COLUMN_NAMES).toBe(ALLOWED_COLUMN_NAMES);
            expect(__test__.defaultColumnQueryRepository).toBe(defaultColumnQueryRepository);
            expect(__test__.makeGetConfigHandler).toBe(makeGetConfigHandler);
        });
    });
});
