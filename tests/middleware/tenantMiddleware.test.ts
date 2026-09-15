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
        const res = {} as Response;
        const next = vi.fn() as NextFunction;
        return { req, res, next };
    };

    it('derives tenant from X-Tenant header', async () => {
        const mw = tenantMiddleware();
        const { req, res, next } = createReqResNext({
            headers: { 'x-tenant': 'acme.corp.com' },
        });

        await mw(req, res, next);

        expect((req as any).tenant).toBe('acme');
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
            headers: { 'access-control-allow-origin': 'mytenant.domain.org' },
        });

        await mw(req, res, next);

        expect((req as any).tenant).toBe('mytenant');
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('derives tenant from two-part domain header when not a generic domain', async () => {
        const mw = tenantMiddleware();
        const { req, res, next } = createReqResNext({
            headers: { origin: 'customtenant.org' },
        });

        await mw(req, res, next);

        expect((req as any).tenant).toBe('customtenant');
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('derives tenant from hostname when not present in headers', async () => {
        const mw = tenantMiddleware();
        const { req, res, next } = createReqResNext({
            hostname: 'subtenant.example.com',
        });

        await mw(req, res, next);

        expect((req as any).tenant).toBe('subtenant');
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('derives tenant from 2-part custom hostname', async () => {
        const mw = tenantMiddleware();
        const { req, res, next } = createReqResNext({
            hostname: 'customhost.io',
        });

        await mw(req, res, next);

        expect((req as any).tenant).toBe('customhost');
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('falls back to app_key in query or body', async () => {
        const mw = tenantMiddleware();
        const { req, res, next } = createReqResNext({
            hostname: 'localhost',
            query: { app_key: 'tenantapp.key.123' },
        });

        await mw(req, res, next);

        expect((req as any).tenant).toBe('tenantapp');
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('falls back to app_key in body when query has none', async () => {
        const mw = tenantMiddleware();
        const { req, res, next } = createReqResNext({
            hostname: 'localhost',
            body: { app_key: 'bodytenant.key' },
        });

        await mw(req, res, next);

        expect((req as any).tenant).toBe('bodytenant');
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('defaults generic domains (api, public, iworkhere) to localhost', async () => {
        const mw = tenantMiddleware();
        const { req, res, next } = createReqResNext({
            headers: { 'x-tenant': 'api' },
        });

        await mw(req, res, next);

        expect((req as any).tenant).toBe('localhost');
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('maps third-party auth domains (accounts, google) to public', async () => {
        const mw = tenantMiddleware();
        const { req, res, next } = createReqResNext({
            headers: { 'x-tenant': 'accounts' },
        });

        await mw(req, res, next);

        expect((req as any).tenant).toBe('public');
        expect(next).toHaveBeenCalledTimes(1);
    });
});
