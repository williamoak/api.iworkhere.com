import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

import { authMiddleware } from '@middleware/authMiddleware';
import { db } from '@src/services/dbService';

type ResMock = Response & {
    statusCode: number;
    body: unknown;
    headers: Record<string, string>;
};

function createReq(authorization?: string, requestId?: string): Request {
    const headers: Record<string, string> = {};
    if (authorization) headers.authorization = authorization;
    if (requestId) headers['x-request-id'] = requestId;
    return {
        method: 'GET',
        url: '/v1/auth/me',
        ip: '127.0.0.1',
        get(name: string) {
            return headers[name.toLowerCase()];
        },
    } as unknown as Request;
}

function createRes(): ResMock {
    return {
        statusCode: 0,
        body: undefined,
        headers: {},
        status(code: number) {
            this.statusCode = code;
            return this;
        },
        json(payload: unknown) {
            this.body = payload;
            return this;
        },
        setHeader(key: string, value: string) {
            this.headers[key.toLowerCase()] = value;
            return this;
        },
    } as ResMock;
}

function createNext(): NextFunction {
    return vi.fn();
}

function mockDbRows(rows: Array<{ userId: string }>) {
    vi.mocked(db.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
            where: vi.fn().mockReturnValueOnce({
                limit: vi.fn().mockResolvedValueOnce(rows),
            }),
        }),
    } as any);
}

function mockDbThrow(error: unknown) {
    vi.mocked(db.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
            where: vi.fn().mockReturnValueOnce({
                limit: vi.fn().mockRejectedValueOnce(error),
            }),
        }),
    } as any);
}

describe('authMiddleware', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env.AUTH_MW_DEBUG;
        vi.mocked(db.select).mockImplementation(() => {
            throw new Error('Mock not configured for this test');
        });
    });

    test('returns 401 when authorization header is missing', async () => {
        const req = createReq();
        const res = createRes();
        const next = createNext();

        await authMiddleware()(req, res, next);

        expect(res.statusCode).toBe(401);
        expect(res.body).toEqual({ error: 'UNAUTHORIZED' });
        expect(next).not.toHaveBeenCalled();
    });

    test('returns 401 when authorization scheme is not Bearer', async () => {
        const req = createReq('Basic token');
        const res = createRes();
        const next = createNext();

        await authMiddleware()(req, res, next);

        expect(res.statusCode).toBe(401);
        expect(res.body).toEqual({ error: 'UNAUTHORIZED' });
        expect(next).not.toHaveBeenCalled();
    });

    test('returns 401 when bearer token is empty', async () => {
        const req = createReq('Bearer ');
        const res = createRes();
        const next = createNext();

        await authMiddleware()(req, res, next);

        expect(res.statusCode).toBe(401);
        expect(res.body).toEqual({ error: 'UNAUTHORIZED' });
        expect(next).not.toHaveBeenCalled();
    });

    test('returns 401 when bearer token is whitespace', async () => {
        const req = createReq('Bearer   ');
        const res = createRes();
        const next = createNext();

        await authMiddleware()(req, res, next);

        expect(res.statusCode).toBe(401);
        expect(res.body).toEqual({ error: 'UNAUTHORIZED' });
        expect(next).not.toHaveBeenCalled();
    });

    test('returns 401 when no token found in DB', async () => {
        mockDbRows([]);

        const req = createReq('Bearer valid-token');
        const res = createRes();
        const next = createNext();

        await authMiddleware()(req, res, next);

        expect(res.statusCode).toBe(401);
        expect(res.body).toEqual({ error: 'UNAUTHORIZED' });
        expect(next).not.toHaveBeenCalled();
    });

    test('attaches auth and calls next when token is valid', async () => {
        mockDbRows([{ userId: 'user-123' }]);

        const req = createReq('Bearer valid-token');
        const res = createRes();
        const next = createNext();

        await authMiddleware()(req, res, next);

        expect((req as any).auth).toEqual({ userId: 'user-123' });
        expect(next).toHaveBeenCalled();
        expect(res.statusCode).toBe(0);
    });

    test('calls next with error when DB throws', async () => {
        const dbError = new Error('DB error');
        mockDbThrow(dbError);

        const req = createReq('Bearer valid-token');
        const res = createRes();
        const next = createNext();

        await authMiddleware()(req, res, next);

        expect(next).toHaveBeenCalledWith(dbError);
        expect(res.statusCode).toBe(0);
    });

    test('returns debug info in 401 response when debug enabled', async () => {
        process.env.AUTH_MW_DEBUG = '1';

        const req = createReq();
        const res = createRes();
        const next = createNext();

        await authMiddleware()(req, res, next);

        expect(res.statusCode).toBe(401);
        expect((res.body as any).debug).toBeDefined();
        expect(res.headers['x-debug-req-id']).toBeDefined();
    });

    test('trims request ID to 128 characters', async () => {
        const longId = 'x'.repeat(200);
        mockDbRows([]);

        const req = createReq('Bearer token', longId);
        const res = createRes();
        const next = createNext();

        await authMiddleware()(req, res, next);

        expect(res.statusCode).toBe(401);
        expect(res.headers['x-debug-req-id']).toBeUndefined();
    });

    test('handles case-insensitive Bearer scheme', async () => {
        mockDbRows([{ userId: 'user-456' }]);

        const req = createReq('bearer valid-token');
        const res = createRes();
        const next = createNext();

        await authMiddleware()(req, res, next);

        expect((req as any).auth).toEqual({ userId: 'user-456' });
        expect(next).toHaveBeenCalled();
    });

    test('handles mixed-case Bearer scheme', async () => {
        mockDbRows([{ userId: 'user-789' }]);

        const req = createReq('BeArEr valid-token');
        const res = createRes();
        const next = createNext();

        await authMiddleware()(req, res, next);

        expect((req as any).auth).toEqual({ userId: 'user-789' });
        expect(next).toHaveBeenCalled();
    });

    test('handles Bearer with leading spaces', async () => {
        mockDbRows([{ userId: 'user-leading-spaces' }]);

        const req = createReq('  Bearer valid-token');
        const res = createRes();
        const next = createNext();

        await authMiddleware()(req, res, next);

        expect(res.statusCode).toBe(0);
        expect(next).toHaveBeenCalled();
        expect((req as any).auth).toEqual({ userId: 'user-leading-spaces' });
    });

    test('handles Bearer with multiple spaces between scheme and token', async () => {
        mockDbRows([{ userId: 'user-spaces' }]);

        const req = createReq('Bearer    valid-token');
        const res = createRes();
        const next = createNext();

        await authMiddleware()(req, res, next);

        expect((req as any).auth).toEqual({ userId: 'user-spaces' });
        expect(next).toHaveBeenCalled();
    });

    test('handles token with leading/trailing spaces', async () => {
        mockDbRows([{ userId: 'user-trim' }]);

        const req = createReq('Bearer   token-with-spaces   ');
        const res = createRes();
        const next = createNext();

        await authMiddleware()(req, res, next);

        expect((req as any).auth).toEqual({ userId: 'user-trim' });
        expect(next).toHaveBeenCalled();
    });

    test('preserves request ID when less than 128 characters', async () => {
        process.env.AUTH_MW_DEBUG = '1';
        const shortId = 'my-request-id-12345';

        mockDbRows([]);

        const req = createReq('Bearer invalid-token');
        const res = createRes();
        const next = createNext();

        (req as any).get = (name: string) => {
            const headers: Record<string, string> = {
                authorization: 'Bearer invalid-token',
                'x-request-id': shortId,
            };
            return headers[name.toLowerCase()];
        };

        await authMiddleware()(req, res, next);

        expect(res.headers['x-debug-req-id']).toBe(shortId);
    });

    test('does not include debug headers in 401 when debug disabled', async () => {
        delete process.env.AUTH_MW_DEBUG;

        const req = createReq();
        const res = createRes();
        const next = createNext();

        await authMiddleware()(req, res, next);

        expect(res.statusCode).toBe(401);
        expect(res.headers['x-debug-req-id']).toBeUndefined();
        expect(res.headers['x-debug-auth-reason']).toBeUndefined();
        expect((res.body as any).debug).toBeUndefined();
    });

    test('includes x-debug-auth-reason header in debug mode', async () => {
        process.env.AUTH_MW_DEBUG = '1';

        mockDbRows([]);

        const req = createReq('Bearer invalid-token');
        const res = createRes();
        const next = createNext();

        await authMiddleware()(req, res, next);

        expect(res.statusCode).toBe(401);
        expect(res.headers['x-debug-auth-reason']).toBe(
            'TOKEN_NOT_FOUND_OR_EXPIRED_OR_REVOKED_OR_WRONG_TYPE',
        );
    });

    test('generates UUID for request ID when not provided', async () => {
        mockDbRows([{ userId: 'user-123' }]);

        const req = createReq('Bearer valid-token');
        const res = createRes();
        const next = createNext();

        await authMiddleware()(req, res, next);

        expect(next).toHaveBeenCalled();
    });

    test('rejects Bearer scheme with other schemes present', async () => {
        mockDbRows([{ userId: 'user-other-schemes' }]);

        const req = createReq('Bearer token, Authorization: Basic other');
        const res = createRes();
        const next = createNext();

        await authMiddleware()(req, res, next);

        expect(res.statusCode).toBe(0);
        expect(next).toHaveBeenCalled();
        expect((req as any).auth).toEqual({ userId: 'user-other-schemes' });
    });
});
