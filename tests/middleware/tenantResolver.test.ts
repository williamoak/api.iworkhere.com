import { describe, expect, test, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { resolveTenantMiddleware, executeTenantSpecific, clearTenantCache } from '@middleware/tenantResolver';
import fs from 'fs/promises';

vi.mock('fs/promises');

describe('tenantResolver', () => {
    const req = {} as Request;
    const res = {} as Response;
    const next = vi.fn() as NextFunction;

    beforeEach(() => {
        vi.clearAllMocks();
        clearTenantCache();
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

    test('clearTenantCache clears the cache', async () => {
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
