import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

import { cacheMiddleware } from '@middleware/cacheMiddleware';
import { cacheStore } from '@cache/cacheStore';

type ResMock = Response & {
    statusCode: number;
    body: unknown;
    headers: Record<string, string>;
    json: (body: unknown) => Response;
    setHeader: (name: string, value: string) => Response;
};

function createReq(options?: {
    method?: string;
    hostname?: string;
    baseUrl?: string;
    path?: string;
    originalUrl?: string;
    authorization?: string;
    auth?: { userId: string };
    tenant?: string;
}): Request {
    const headers: Record<string, string> = {};
    if (options?.authorization) headers.authorization = options.authorization;

    return {
        method: options?.method || 'GET',
        hostname: options?.hostname || 'app.example.com',
        baseUrl: options?.baseUrl || '/v1',
        path: options?.path || '/config',
        originalUrl: options?.originalUrl || options?.path || '/v1/config',
        tenant: options?.tenant,
        auth: options?.auth,
        get(name: string): any {
            return headers[name.toLowerCase()];
        },
    } as unknown as Request;
}

function createRes(): ResMock {
    const res = {
        statusCode: 200,
        body: undefined,
        headers: {} as Record<string, string>,
        setHeader(name: string, value: string) {
            this.headers[name.toLowerCase()] = value;
            return this;
        },
        json(payload: unknown) {
            this.body = payload;
            return this;
        },
    } as unknown as ResMock;
    return res;
}

function createNext(): NextFunction {
    return vi.fn() as unknown as NextFunction;
}

describe('cacheMiddleware', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        await cacheStore.clear();
    });

    test('bypasses cache when authorization header is present', async () => {
        const req = createReq({
            method: 'GET',
            path: '/auth/me',
            authorization: 'Bearer user-token',
        });
        const res = createRes();
        const next = createNext();

        const mw = cacheMiddleware();
        await mw(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);

        // Verify res.json was not wrapped to write to cacheStore
        res.json({ id: 'user-1', name: 'Bill' });
        expect(res.headers['x-cache']).toBeUndefined();

        // Ensure nothing was stored in cache
        const stored = await cacheStore.get('app:/v1:/auth/me:');
        expect(stored).toBeNull();
    });

    test('bypasses cache when req.auth is present', async () => {
        const req = createReq({
            method: 'GET',
            path: '/profile',
            auth: { userId: 'user-123' },
        });
        const res = createRes();
        const next = createNext();

        const mw = cacheMiddleware();
        await mw(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);

        res.json({ profile: 'secret' });
        expect(res.headers['x-cache']).toBeUndefined();
    });

    test('caches unauthenticated GET response with X-Cache MISS then HIT', async () => {
        const req1 = createReq({
            method: 'GET',
            hostname: 'joinaunion.example.com',
            baseUrl: '/v1',
            path: '/config',
            originalUrl: '/v1/config',
        });
        const res1 = createRes();
        const next1 = createNext();

        const mw = cacheMiddleware();
        await mw(req1, res1, next1);
        expect(next1).toHaveBeenCalledTimes(1);

        // Handler responds
        res1.json({ site: 'joinaunion', setting: 1 });
        expect(res1.headers['x-cache']).toBe('MISS');
        expect(res1.body).toEqual({ site: 'joinaunion', setting: 1 });

        // Second request gets cache HIT
        const req2 = createReq({
            method: 'GET',
            hostname: 'joinaunion.example.com',
            baseUrl: '/v1',
            path: '/config',
            originalUrl: '/v1/config',
        });
        const res2 = createRes();
        const next2 = createNext();

        await mw(req2, res2, next2);
        expect(res2.headers['x-cache']).toBe('HIT');
        expect(res2.body).toEqual({ site: 'joinaunion', setting: 1 });
        expect(next2).not.toHaveBeenCalled();
    });

    test('PUT updates the cached value', async () => {
        const mw = cacheMiddleware();

        const putReq = createReq({
            method: 'PUT',
            hostname: 'joinaunion.example.com',
            baseUrl: '/v1',
            path: '/config',
            originalUrl: '/v1/config',
        });
        const putRes = createRes();
        const putNext = createNext();

        await mw(putReq, putRes, putNext);
        expect(putNext).toHaveBeenCalledTimes(1);

        putRes.json({ site: 'joinaunion', setting: 2 });

        const cached = await cacheStore.get('joinaunion:/v1:/config:');
        expect(cached).toEqual({ site: 'joinaunion', setting: 2 });
    });

    test('DELETE invalidates cached entries for resource prefix', async () => {
        await cacheStore.set('joinaunion:/v1:/config:', { setting: 1 }, 30000);
        await cacheStore.set('joinaunion:/v1:/config:filter=true', { setting: 2 }, 30000);

        const mw = cacheMiddleware();

        const deleteReq = createReq({
            method: 'DELETE',
            hostname: 'joinaunion.example.com',
            baseUrl: '/v1',
            path: '/config',
            originalUrl: '/v1/config',
        });
        const deleteRes = createRes();
        const deleteNext = createNext();

        await mw(deleteReq, deleteRes, deleteNext);
        expect(deleteNext).toHaveBeenCalledTimes(1);

        expect(await cacheStore.get('joinaunion:/v1:/config:')).toBeNull();
        expect(await cacheStore.get('joinaunion:/v1:/config:filter=true')).toBeNull();
    });
});
