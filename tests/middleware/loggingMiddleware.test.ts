import { describe, expect, test, vi } from 'vitest';
import { loggingMiddleware } from '../../src/middleware/loggingMiddleware';
import joinaunionLoggingMiddleware from '../../src/middleware/joinaunion/loggingMiddleware';
import { dbStorage } from '../../src/services/dbService';

describe('loggingMiddleware', () => {
    test('registers finish listener and calls next()', async () => {
        const req = {
            path: '/v1/users',
            originalUrl: '/v1/users',
            method: 'GET',
            headers: {},
            tenant: 'joinaunion',
        } as any;
        const res = {
            locals: {},
            statusCode: 200,
            once: vi.fn(),
        } as any;
        const next = vi.fn();

        const middleware = loggingMiddleware();
        await middleware(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.once).toHaveBeenCalledWith('finish', expect.any(Function));
    });
});

describe('joinaunion/loggingMiddleware', () => {
    test('skips DB insert when request is for /v1/localization', async () => {
        const mockDb = {
            insert: vi.fn().mockReturnValue({
                values: vi.fn().mockResolvedValue({}),
            }),
            execute: vi.fn().mockResolvedValue({ rows: [] }),
        };

        const req = {
            path: '/v1/localization',
            originalUrl: '/v1/localization?slug=username',
            headers: { 'user-agent': 'test' },
        } as any;
        const res = { locals: {}, writableEnded: true } as any;
        const next = vi.fn();

        await dbStorage.run(mockDb as any, async () => {
            await joinaunionLoggingMiddleware(req, res, next);
        });

        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(mockDb.insert).not.toHaveBeenCalled();
        expect(res.locals.visitLogged).toBe(true);
        expect(next).toHaveBeenCalled();
    });

    test('skips DB insert when request is for /localization', async () => {
        const mockDb = {
            insert: vi.fn().mockReturnValue({
                values: vi.fn().mockResolvedValue({}),
            }),
            execute: vi.fn().mockResolvedValue({ rows: [] }),
        };

        const req = {
            path: '/localization',
            originalUrl: '/localization',
            headers: { 'user-agent': 'test' },
        } as any;
        const res = { locals: {}, writableEnded: true } as any;
        const next = vi.fn();

        await dbStorage.run(mockDb as any, async () => {
            await joinaunionLoggingMiddleware(req, res, next);
        });

        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(mockDb.insert).not.toHaveBeenCalled();
        expect(res.locals.visitLogged).toBe(true);
        expect(next).toHaveBeenCalled();
    });

    test('skips DB insert when res.locals.visitLogged is already true', async () => {
        const mockDb = {
            insert: vi.fn().mockReturnValue({
                values: vi.fn().mockResolvedValue({}),
            }),
            execute: vi.fn().mockResolvedValue({ rows: [] }),
        };

        const req = {
            path: '/v1/auth/me',
            originalUrl: '/v1/auth/me',
            headers: { 'user-agent': 'test' },
        } as any;
        const res = { locals: { visitLogged: true }, writableEnded: true } as any;
        const next = vi.fn();

        await dbStorage.run(mockDb as any, async () => {
            await joinaunionLoggingMiddleware(req, res, next);
        });

        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(mockDb.insert).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalled();
    });

    test('calls db.insert for regular requests when not previously marked logged', async () => {
        const mockDb = {
            insert: vi.fn().mockReturnValue({
                values: vi.fn().mockResolvedValue({}),
            }),
            execute: vi.fn().mockResolvedValue({ rows: [] }),
        };

        const req = {
            path: '/v1/auth/me',
            originalUrl: '/v1/auth/me',
            headers: { 'user-agent': 'test' },
        } as any;
        const res = { locals: {}, writableEnded: true } as any;
        const next = vi.fn();

        await dbStorage.run(mockDb as any, async () => {
            await joinaunionLoggingMiddleware(req, res, next);
        });

        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(mockDb.insert).toHaveBeenCalled();
        expect(res.locals.visitLogged).toBe(true);
        expect(next).toHaveBeenCalled();
    });
});
