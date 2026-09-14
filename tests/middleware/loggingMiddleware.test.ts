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

    test('extracts latitude and longitude from request headers', async () => {
        let insertedValues: any = null;
        const mockDb = {
            insert: vi.fn().mockReturnValue({
                values: vi.fn().mockImplementation((val) => {
                    insertedValues = val;
                    return Promise.resolve({});
                }),
            }),
            execute: vi.fn().mockResolvedValue({ rows: [] }),
        };

        const req = {
            path: '/v1/auth/me',
            originalUrl: '/v1/auth/me',
            headers: {
                'user-agent': 'mobile-app',
                'x-latitude': '37.7749',
                'x-longitude': '-122.4194',
            },
        } as any;
        const res = { locals: {}, writableEnded: true } as any;
        const next = vi.fn();

        await dbStorage.run(mockDb as any, async () => {
            await joinaunionLoggingMiddleware(req, res, next);
        });

        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(mockDb.insert).toHaveBeenCalled();
        expect(insertedValues).not.toBeNull();
        expect(insertedValues.latitude).toBe(37.7749);
        expect(insertedValues.longitude).toBe(-122.4194);
        expect(res.locals.visitLogged).toBe(true);
    });

    test('extracts latitude and longitude from res.locals when set', async () => {
        let insertedValues: any = null;
        const mockDb = {
            insert: vi.fn().mockReturnValue({
                values: vi.fn().mockImplementation((val) => {
                    insertedValues = val;
                    return Promise.resolve({});
                }),
            }),
            execute: vi.fn().mockResolvedValue({ rows: [] }),
        };

        const req = {
            path: '/v1/auth/me',
            originalUrl: '/v1/auth/me',
            headers: { 'user-agent': 'mobile-app' },
        } as any;
        const res = {
            locals: {
                visitLatitude: 40.7128,
                visitLongitude: -74.0060,
            },
            writableEnded: true,
        } as any;
        const next = vi.fn();

        await dbStorage.run(mockDb as any, async () => {
            await joinaunionLoggingMiddleware(req, res, next);
        });

        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(mockDb.insert).toHaveBeenCalled();
        expect(insertedValues).not.toBeNull();
        expect(insertedValues.latitude).toBe(40.7128);
        expect(insertedValues.longitude).toBe(-74.0060);
        expect(res.locals.visitLogged).toBe(true);
    });

    test('defaults latitude and longitude to null for standard web requests', async () => {
        let insertedValues: any = null;
        const mockDb = {
            insert: vi.fn().mockReturnValue({
                values: vi.fn().mockImplementation((val) => {
                    insertedValues = val;
                    return Promise.resolve({});
                }),
            }),
            execute: vi.fn().mockResolvedValue({ rows: [] }),
        };

        const req = {
            path: '/v1/auth/me',
            originalUrl: '/v1/auth/me',
            headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        } as any;
        const res = { locals: {}, writableEnded: true } as any;
        const next = vi.fn();

        await dbStorage.run(mockDb as any, async () => {
            await joinaunionLoggingMiddleware(req, res, next);
        });

        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(mockDb.insert).toHaveBeenCalled();
        expect(insertedValues).not.toBeNull();
        expect(insertedValues.latitude).toBeNull();
        expect(insertedValues.longitude).toBeNull();
        expect(insertedValues.locationSource).toBeNull();
        expect(res.locals.visitLogged).toBe(true);
    });

    test('extracts location_source from headers or res.locals', async () => {
        let insertedValues: any = null;
        const mockDb = {
            insert: vi.fn().mockReturnValue({
                values: vi.fn().mockImplementation((val) => {
                    insertedValues = val;
                    return Promise.resolve({});
                }),
            }),
            execute: vi.fn().mockResolvedValue({ rows: [] }),
        };

        const req = {
            path: '/v1/auth/me',
            originalUrl: '/v1/auth/me',
            headers: {
                'user-agent': 'mobile-app',
                'x-latitude': '41.8781',
                'x-longitude': '-87.6298',
                'x-location-source': 'ip_centroid',
                'x-city': 'Chicago',
            },
        } as any;
        const res = { locals: {}, writableEnded: true } as any;
        const next = vi.fn();

        await dbStorage.run(mockDb as any, async () => {
            await joinaunionLoggingMiddleware(req, res, next);
        });

        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(mockDb.insert).toHaveBeenCalled();
        expect(insertedValues).not.toBeNull();
        expect(insertedValues.latitude).toBe(41.8781);
        expect(insertedValues.longitude).toBe(-87.6298);
        expect(insertedValues.locationSource).toBe('ip_centroid');
        expect(insertedValues.city).toBe('Chicago');
        expect(res.locals.visitLogged).toBe(true);
    });

    test('extracts city from res.locals when set', async () => {
        let insertedValues: any = null;
        const mockDb = {
            insert: vi.fn().mockReturnValue({
                values: vi.fn().mockImplementation((val) => {
                    insertedValues = val;
                    return Promise.resolve({});
                }),
            }),
            execute: vi.fn().mockResolvedValue({ rows: [] }),
        };

        const req = {
            path: '/v1/auth/me',
            originalUrl: '/v1/auth/me',
            headers: { 'user-agent': 'mobile-app' },
        } as any;
        const res = {
            locals: {
                visitCity: 'Toronto',
            },
            writableEnded: true,
        } as any;
        const next = vi.fn();

        await dbStorage.run(mockDb as any, async () => {
            await joinaunionLoggingMiddleware(req, res, next);
        });

        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(mockDb.insert).toHaveBeenCalled();
        expect(insertedValues).not.toBeNull();
        expect(insertedValues.city).toBe('Toronto');
        expect(res.locals.visitLogged).toBe(true);
    });
});
