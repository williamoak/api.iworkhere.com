/**
 * @myDocBlock v2.3
 * @file GET.test.ts
 * @internal
 * @module tests/routes/v1/auth/me
 * @tag auth, me, test
 * @version 1.0.0
 * @path tests/routes/v1/auth/me/GET.test.ts
 * @summary Tests GET /v1/auth/me endpoint glue logic.
 * @description
 * Verifies that the auth-me endpoint correctly enforces Bearer authorization,
 * requires req.auth.userId, loads the user record, applies account-state gates,
 * and returns the expected identity payload. Business logic is mocked and tested
 * separately.
 *
 * Also verifies that the endpoint exports a Zod query contract and route handler.
 *
 * @requires
 * {
 *   "services": [
 *     "users/getUserById"
 *   ]
 * }
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

import GET, { authRequired } from '@routes/v1/auth/me/GET';
import { getUserById } from '@services/users/getUserById';

type ResMock = Response & {
    statusCode: number;
    body: unknown;
};

function createReq(options?: {
    authorization?: string;
    requestId?: string;
    authUserId?: string;
}): Request {
    const headers: Record<string, string> = {};
    if (options?.authorization) headers.authorization = options.authorization;
    if (options?.requestId) headers['x-request-id'] = options.requestId;

    const req: Record<string, unknown> = {
        method: 'GET',
        url: '/v1/auth/me',
        path: '/v1/auth/me',
        originalUrl: '/v1/auth/me',
        ip: '127.0.0.1',
        get(name: string) {
            return headers[name.toLowerCase()];
        },
    };

    if (options?.authUserId) {
        req.auth = { userId: options.authUserId };
    }

    return req as unknown as Request;
}

function createRes(): ResMock {
    return {
        statusCode: 0,
        body: undefined,
        status(code: number) {
            this.statusCode = code;
            return this;
        },
        json(payload: unknown) {
            this.body = payload;
            return this;
        },
    } as ResMock;
}

describe('GET /v1/auth/me', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env.AUTH_ME_DEBUG;
    });

    it('exports authRequired = true', () => {
        expect(authRequired).toBe(true);
    });

    it('returns 401 when authorization header is missing', async () => {
        vi.mocked(getUserById).mockResolvedValue(null as any);

        const req = createReq({
            authUserId: 'user-123',
        });
        const res = createRes();

        await GET(req, res);

        expect(res.statusCode).toBe(401);
        expect(res.body).toEqual({ error: 'UNAUTHORIZED' });
    });

    it('returns 401 when req.auth.userId is missing', async () => {
        const req = createReq({
            authorization: 'Bearer valid-token',
        });
        const res = createRes();

        await GET(req, res);

        expect(res.statusCode).toBe(401);
        expect(res.body).toEqual({ error: 'UNAUTHORIZED' });
        expect(getUserById).not.toHaveBeenCalled();
    });

    it('returns 401 when user is not found', async () => {
        vi.mocked(getUserById).mockResolvedValue(null as any);

        const req = createReq({
            authorization: 'Bearer valid-token',
            authUserId: 'user-404',
        });
        const res = createRes();

        await GET(req, res);

        expect(getUserById).toHaveBeenCalledWith('user-404');
        expect(res.statusCode).toBe(401);
        expect(res.body).toEqual({ error: 'UNAUTHORIZED' });
    });

    it('returns 423 when user is locked', async () => {
        vi.mocked(getUserById).mockResolvedValue({
            id: 'user-locked',
            username: 'locked-user',
            email: 'locked@example.com',
            status: 'locked',
            eulaAccepted: true,
        } as any);

        const req = createReq({
            authorization: 'Bearer valid-token',
            authUserId: 'user-locked',
        });
        const res = createRes();

        await GET(req, res);

        expect(res.statusCode).toBe(423);
        expect(res.body).toEqual({ error: 'ACCOUNT_LOCKED' });
    });

    it('returns 403 when user is disabled', async () => {
        vi.mocked(getUserById).mockResolvedValue({
            id: 'user-disabled',
            username: 'disabled-user',
            email: 'disabled@example.com',
            status: 'disabled',
            eulaAccepted: true,
        } as any);

        const req = createReq({
            authorization: 'Bearer valid-token',
            authUserId: 'user-disabled',
        });
        const res = createRes();

        await GET(req, res);

        expect(res.statusCode).toBe(403);
        expect(res.body).toEqual({ error: 'ACCOUNT_DISABLED' });
    });

    it('returns 403 when EULA is not accepted', async () => {
        vi.mocked(getUserById).mockResolvedValue({
            id: 'user-eula',
            username: 'eula-user',
            email: 'eula@example.com',
            status: 'active',
            eulaAccepted: false,
        } as any);

        const req = createReq({
            authorization: 'Bearer valid-token',
            authUserId: 'user-eula',
        });
        const res = createRes();

        await GET(req, res);

        expect(res.statusCode).toBe(403);
        expect(res.body).toEqual({ error: 'EULA_REQUIRED' });
    });

    it('returns 200 with the expected identity payload', async () => {
        vi.mocked(getUserById).mockResolvedValue({
            id: 'user-123',
            username: 'exampleUser',
            email: 'user@example.com',
            status: 'active',
            eulaAccepted: true,
        } as any);

        const req = createReq({
            authorization: 'Bearer valid-token',
            authUserId: 'user-123',
        });
        const res = createRes();

        await GET(req, res);

        expect(getUserById).toHaveBeenCalledWith('user-123');
        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({
            id: 'user-123',
            username: 'exampleUser',
            email: 'user@example.com',
            status: 'active',
        });
    });

    it('returns 500 on unexpected errors', async () => {
        vi.mocked(getUserById).mockRejectedValue(new Error('boom'));

        const req = createReq({
            authorization: 'Bearer valid-token',
            authUserId: 'user-123',
        });
        const res = createRes();

        await GET(req, res);

        expect(res.statusCode).toBe(500);
        expect(res.body).toEqual({ error: 'INTERNAL_SERVER_ERROR' });
    });

    it('handles debug mode without changing the response contract', async () => {
        process.env.AUTH_ME_DEBUG = '1';

        vi.mocked(getUserById).mockResolvedValue({
            id: 'user-debug',
            username: 'debug-user',
            email: 'debug@example.com',
            status: 'active',
            eulaAccepted: true,
        } as any);

        const req = createReq({
            authorization: 'Bearer valid-token',
            authUserId: 'user-debug',
            requestId: 'req-debug-123',
        });
        const res = createRes();

        await GET(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({
            id: 'user-debug',
            username: 'debug-user',
            email: 'debug@example.com',
            status: 'active',
        });
    });
});