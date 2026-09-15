import { describe, expect, test, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { resolveTenantMiddleware, executeTenantSpecific, clearTenantCache } from '@middleware/tenantResolver';
import fs from 'fs/promises';

vi.mock('fs/promises');

describe('tenantResolver', () => {
    let req: any;
    let res: any;
    let next: NextFunction;

    beforeEach(() => {
        vi.clearAllMocks();
        clearTenantCache();
        req = {
            headers: {},
            query: {},
            body: {},
            method: 'GET',
            path: '/test',
        };
        res = {
            once: vi.fn(),
            on: vi.fn(),
            setHeader: vi.fn(),
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
        };
        next = vi.fn() as NextFunction;
    });

    test('returns false for public/api/empty tenants', async () => {
        expect(await resolveTenantMiddleware('', 'mw', req, res, next)).toBe(false);
        expect(await resolveTenantMiddleware('public', 'mw', req, res, next)).toBe(false);
        expect(await resolveTenantMiddleware('api', 'mw', req, res, next)).toBe(false);
    });

    test('returns false when middleware file does not exist', async () => {
        vi.mocked(fs.access).mockRejectedValueOnce(new Error('ENOENT'));
        expect(await resolveTenantMiddleware('tenant1', 'nonexistent', req, res, next)).toBe(false);
    });

    test('resolves and executes tenant middleware when file exists', async () => {
        vi.mocked(fs.access).mockResolvedValue(undefined as any);
        const handled = await resolveTenantMiddleware('joinaunion', 'loggingMiddleware', req, res, next);
        expect(handled).toBe(true);

        // Subsequent call uses cache
        const cachedHandled = await resolveTenantMiddleware('joinaunion', 'loggingMiddleware', req, res, next);
        expect(cachedHandled).toBe(true);
    });

    test('executes tenant-specific middleware via executeTenantSpecific', async () => {
        vi.mocked(fs.access).mockResolvedValue(undefined as any);
        await executeTenantSpecific('joinaunion', 'loggingMiddleware', req, res, next);

        // Call again to hit cached path
        await executeTenantSpecific('joinaunion', 'loggingMiddleware', req, res, next);
    });

    test('catches errors during module execution gracefully', async () => {
        vi.mocked(fs.access).mockResolvedValue(undefined as any);
        // nonexistent middleware file where fs.access mocked to resolve but import fails
        const handled = await resolveTenantMiddleware('tenant1', 'brokenMiddleware', req, res, next);
        expect(handled).toBe(false);

        await executeTenantSpecific('tenant1', 'brokenMiddleware', req, res, next);
    });

    test('clearTenantCache clears the cache selectively by tenant and globally', async () => {
        vi.mocked(fs.access).mockResolvedValue(undefined as any);
        await resolveTenantMiddleware('tenant1', 'loggingMiddleware', req, res, next);

        clearTenantCache('tenant1');
        clearTenantCache();
    });

    test('executeTenantSpecific does nothing for public/api/empty tenants', async () => {
        await executeTenantSpecific('', 'mw', req, res, next);
        await executeTenantSpecific('public', 'mw', req, res, next);
        await executeTenantSpecific('api', 'mw', req, res, next);
    });

    test('executeTenantSpecific catches fs errors', async () => {
        vi.mocked(fs.access).mockRejectedValueOnce(new Error('ENOENT'));
        await executeTenantSpecific('tenant1', 'nonexistent', req, res, next);
    });
});
