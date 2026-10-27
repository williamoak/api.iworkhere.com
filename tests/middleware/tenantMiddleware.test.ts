import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { tenantMiddleware } from '@middleware/tenantMiddleware';

describe('tenantMiddleware', () => {
    const createReqResNext = (reqOverrides: Partial<Request> = {}) => {
        const req = {
            headers: {},
            hostname: 'localhost',
            query: {},
            body: {},
            ...reqOverrides,
        } as unknown as Request;
        const json = vi.fn();
        const res = { status: vi.fn(() => ({ json })) } as unknown as Response;
        const next = vi.fn() as NextFunction;
        return { req, res, next };
    };

    it('derives tenant from X-Tenant header', async () => {
        const mw = tenantMiddleware();
        const { req, res, next } = createReqResNext({
            headers: { 'x-tenant': 'bill.workhere.com' },
        });

        await mw(req, res, next);

        expect((req as any).tenant).toBe('bill');
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('derives tenant from Origin or Referer with protocol match', async () => {
        const mw = tenantMiddleware();
        const { req, res, next } = createReqResNext({
            headers: { origin: 'https://joinaunion.iworkhere.com' },
        });

        await mw(req, res, next);

        expect((req as any).tenant).toBe('joinaunion');
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('derives tenant from Access-Control-Allow-Origin header without protocol', async () => {
        const mw = tenantMiddleware();
        const { req, res, next } = createReqResNext({
            headers: { 'access-control-allow-origin': 'joinaunion.domain.org' },
        });

        await mw(req, res, next);

        expect((req as any).tenant).toBe('joinaunion');
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('derives tenant from two-part domain header when not a generic domain', async () => {
        const mw = tenantMiddleware();
        const { req, res, next } = createReqResNext({
            headers: { origin: 'bill.org' },
        });

        await mw(req, res, next);

        expect((req as any).tenant).toBe('bill');
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('derives tenant from hostname when not present in headers', async () => {
        const mw = tenantMiddleware();
        const { req, res, next } = createReqResNext({
            hostname: 'michael.example.com',
        });

        await mw(req, res, next);

        expect((req as any).tenant).toBe('michael');
        expect(next).toHaveBeenCalledTimes(1);
    });

    it.each(['api-dev.iworkhere.com'])(
        'uses public context for API hostname %s',
        async (hostname) => {
            const mw = tenantMiddleware();
            const { req, res, next } = createReqResNext({ hostname });

            await mw(req, res, next);

            expect((req as any).tenant).toBe('public');
            expect(next).toHaveBeenCalledTimes(1);
        },
    );

    it('uses public context when the API hostname is supplied as the origin', async () => {
        const mw = tenantMiddleware();
        const { req, res, next } = createReqResNext({
            hostname: 'api-dev.iworkhere.com',
            headers: { origin: 'https://api-dev.iworkhere.com' },
        });

        await mw(req, res, next);

        expect((req as any).tenant).toBe('public');
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('uses public context when a proxy hostname hides the API origin', async () => {
        const mw = tenantMiddleware();
        const { req, res, next } = createReqResNext({
            hostname: 'public.iworkhere.com',
            headers: { referer: 'https://api-dev.iworkhere.com/' },
        });

        await mw(req, res, next);

        expect((req as any).tenant).toBe('public');
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('uses public context when the proxy receives a frontend origin', async () => {
        const mw = tenantMiddleware();
        const { req, res, next } = createReqResNext({
            hostname: 'public.iworkhere.com',
            headers: { origin: 'https://joinaunion-dev.iworkhere.com' },
        });

        await mw(req, res, next);

        expect((req as any).tenant).toBe('public');
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('derives tenant from 2-part custom hostname', async () => {
        const mw = tenantMiddleware();
        const { req, res, next } = createReqResNext({
            hostname: 'joinaunion.io',
        });

        await mw(req, res, next);

        expect((req as any).tenant).toBe('joinaunion');
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('falls back to app_key in query or body', async () => {
        const mw = tenantMiddleware();
        const { req, res, next } = createReqResNext({
            hostname: 'localhost',
            query: { app_key: 'bill.key.123' },
        });

        await mw(req, res, next);

        expect((req as any).tenant).toBe('bill');
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('falls back to app_key in body when query has none', async () => {
        const mw = tenantMiddleware();
        const { req, res, next } = createReqResNext({
            hostname: 'localhost',
            body: { app_key: 'joinaunion.key' },
        });

        await mw(req, res, next);

        expect((req as any).tenant).toBe('joinaunion');
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('does not reserve generic-looking tenant names', async () => {
        const mw = tenantMiddleware();
        const { req, res, next } = createReqResNext({
            headers: { 'x-tenant': 'api' },
        });

        await mw(req, res, next);

        expect((req as any).tenant).toBe('api');
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('does not reserve third-party-looking tenant names', async () => {
        const mw = tenantMiddleware();
        const { req, res, next } = createReqResNext({
            headers: { 'x-tenant': 'accounts' },
        });

        await mw(req, res, next);

        expect((req as any).tenant).toBe('accounts');
        expect(next).toHaveBeenCalledTimes(1);
    });

    it.each([
        'tenant; DROP SCHEMA public',
        'tenant" ; SELECT 1; --',
        'invalid-tenant',
        'a'.repeat(64),
    ])('rejects unsafe X-Tenant value %s before continuing', async (tenant) => {
        const mw = tenantMiddleware();
        const json = vi.fn();
        const status = vi.fn(() => ({ json }));
        const { req, next } = createReqResNext({
            headers: { 'x-tenant': tenant },
        });
        const res = { status } as unknown as Response;

        await mw(req, res, next);

        expect(status).toHaveBeenCalledWith(400);
        expect(json).toHaveBeenCalledWith({
            error: 'INVALID_TENANT',
            message: 'Tenant identifier is invalid(1)',
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('accepts a well-formed tenant without an explicit configuration entry', async () => {
        const mw = tenantMiddleware();
        const { req, next } = createReqResNext({
            headers: { 'x-tenant': 'unconfigured' },
        });
        const res = {} as Response;

        await mw(req, res, next);

        expect((req as any).tenant).toBe('unconfigured');
        expect(next).toHaveBeenCalledOnce();
    });

    it('normalizes tenant names before schema validation', async () => {
        const mw = tenantMiddleware();
        const { req, res, next } = createReqResNext({
            headers: { 'x-tenant': 'BILL.workhere.com' },
        });

        await mw(req, res, next);

        expect((req as any).tenant).toBe('bill');
        expect(next).toHaveBeenCalledOnce();
    });
});
