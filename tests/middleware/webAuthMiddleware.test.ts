import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { webAuthMiddleware } from '@middleware/webAuthMiddleware';
import { db } from '@services/dbService';
import * as tenantResolver from '@middleware/tenantResolver';

vi.mock('@services/dbService', () => ({
    db: {
        select: vi.fn(),
    },
}));

describe('webAuthMiddleware', () => {
    let mockReq: any;
    let mockRes: any;
    let mockNext: NextFunction;

    beforeEach(() => {
        vi.clearAllMocks();
        mockReq = {
            cookies: {},
            headers: {},
            query: {},
        };
        mockRes = {};
        mockNext = vi.fn();
    });

    it('returns early when tenant middleware handles the request', async () => {
        vi.spyOn(tenantResolver, 'resolveTenantMiddleware').mockResolvedValueOnce(true);
        mockReq.tenant = 'customTenant';

        await webAuthMiddleware(mockReq, mockRes, mockNext);

        expect(tenantResolver.resolveTenantMiddleware).toHaveBeenCalledWith(
            'customTenant',
            'webAuthMiddleware',
            mockReq,
            mockRes,
            mockNext
        );
        expect(mockNext).not.toHaveBeenCalled();
    });

    it('sets req.auth to undefined and calls next when no token is present', async () => {
        vi.spyOn(tenantResolver, 'resolveTenantMiddleware').mockResolvedValueOnce(false);

        await webAuthMiddleware(mockReq, mockRes, mockNext);

        expect(mockReq.auth).toBeUndefined();
        expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('authenticates user successfully with token from cookies', async () => {
        vi.spyOn(tenantResolver, 'resolveTenantMiddleware').mockResolvedValueOnce(false);
        mockReq.cookies = { auth_token: 'cookie-token-123' };

        const mockFrom = vi.fn().mockReturnThis();
        const mockWhere = vi.fn().mockReturnThis();
        const mockLimit = vi.fn().mockResolvedValue([{ userId: 'user-from-cookie' }]);

        vi.mocked(db.select).mockReturnValue({
            from: mockFrom,
            where: mockWhere,
            limit: mockLimit,
        } as any);

        await webAuthMiddleware(mockReq, mockRes, mockNext);

        expect(mockReq.auth).toEqual({ userId: 'user-from-cookie' });
        expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('authenticates user successfully with Bearer token in Authorization header', async () => {
        vi.spyOn(tenantResolver, 'resolveTenantMiddleware').mockResolvedValueOnce(false);
        mockReq.headers = { authorization: 'Bearer bearer-token-456' };

        const mockFrom = vi.fn().mockReturnThis();
        const mockWhere = vi.fn().mockReturnThis();
        const mockLimit = vi.fn().mockResolvedValue([{ userId: 'user-from-bearer' }]);

        vi.mocked(db.select).mockReturnValue({
            from: mockFrom,
            where: mockWhere,
            limit: mockLimit,
        } as any);

        await webAuthMiddleware(mockReq, mockRes, mockNext);

        expect(mockReq.auth).toEqual({ userId: 'user-from-bearer' });
        expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('authenticates user successfully with token from query string', async () => {
        vi.spyOn(tenantResolver, 'resolveTenantMiddleware').mockResolvedValueOnce(false);
        mockReq.query = { auth_token: 'query-token-789' };

        const mockFrom = vi.fn().mockReturnThis();
        const mockWhere = vi.fn().mockReturnThis();
        const mockLimit = vi.fn().mockResolvedValue([{ userId: 'user-from-query' }]);

        vi.mocked(db.select).mockReturnValue({
            from: mockFrom,
            where: mockWhere,
            limit: mockLimit,
        } as any);

        await webAuthMiddleware(mockReq, mockRes, mockNext);

        expect(mockReq.auth).toEqual({ userId: 'user-from-query' });
        expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('sets req.auth to undefined when token is invalid or not found in database', async () => {
        vi.spyOn(tenantResolver, 'resolveTenantMiddleware').mockResolvedValueOnce(false);
        mockReq.cookies = { auth_token: 'invalid-token' };

        const mockFrom = vi.fn().mockReturnThis();
        const mockWhere = vi.fn().mockReturnThis();
        const mockLimit = vi.fn().mockResolvedValue([]);

        vi.mocked(db.select).mockReturnValue({
            from: mockFrom,
            where: mockWhere,
            limit: mockLimit,
        } as any);

        await webAuthMiddleware(mockReq, mockRes, mockNext);

        expect(mockReq.auth).toBeUndefined();
        expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('handles database exceptions gracefully and sets req.auth to undefined', async () => {
        vi.spyOn(tenantResolver, 'resolveTenantMiddleware').mockResolvedValueOnce(false);
        mockReq.cookies = { auth_token: 'error-token' };

        vi.mocked(db.select).mockImplementation(() => {
            throw new Error('Database connection failed');
        });

        await webAuthMiddleware(mockReq, mockRes, mockNext);

        expect(mockReq.auth).toBeUndefined();
        expect(mockNext).toHaveBeenCalledTimes(1);
    });
});
