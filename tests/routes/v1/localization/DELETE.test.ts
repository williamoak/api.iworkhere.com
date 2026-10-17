/**
 * @myDocBlock v2.3
 * @file DELETE.test.ts
 * @internal
 * @module tests/routes/v1/localization
 * @tag localization, test
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path tests/routes/v1/localization/DELETE.test.ts
 * @summary Unit tests for DELETE /v1/localization.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('@services/dbService', async () => {
    const { createDbServiceMock } = await import('../../../helpers/dbMock');
    return createDbServiceMock();
});

vi.mock('@db/schema/localizations', () => ({
    localizations: {
        id: 'id',
        slug: 'slug',
        lang: 'lang',
        languageName: 'language_name',
        text: 'text',
        codepage: 'codepage',
        direction: 'direction',
        description: 'description',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
    },
}));

vi.mock('@services/auth/authContext', () => ({
    AuthError: class AuthError extends Error {
        constructor(
            public code: string,
            message: string,
            public httpStatus: number,
        ) {
            super(message);
        }
    },
    resolveAuthContext: vi.fn(),
}));
vi.mock('@services/auth/authUserResolver', () => ({
    resolveUserIdForApplication: vi.fn(),
}));

import DELETE, {
    authRequired,
    makeDeleteLocalizationHandler,
    type LocalizationDeleteRepository,
} from '@routes/v1/localization/DELETE';
import { isCacheDirty, setCachedSupportedLanguages } from '@cache/localizationCache';
import { resolveAuthContext } from '@services/auth/authContext';
import { resolveUserIdForApplication } from '@services/auth/authUserResolver';
import type { LocalizationRecord } from '@routes/v1/localization/GET';

function createMockReq(query: Record<string, unknown>): Request {
    return {
        query,
        auth: { userId: 'admin-user' },
    } as unknown as Request;
}

type ResMock = Response & {
    statusCode: number;
    body?: any;
};

function createMockRes(): ResMock {
    const res = {
        statusCode: 200,
        body: undefined,

        status(code: number) {
            this.statusCode = code;
            return this;
        },

        json(payload: any) {
            this.body = payload;
            return this;
        },
    };

    return res as unknown as ResMock;
}

describe('DELETE /v1/localization', () => {
    let mockRepo: LocalizationDeleteRepository;
    let handler: (req: Request, res: Response) => Promise<any>;

    beforeEach(() => {
        vi.clearAllMocks();
        setCachedSupportedLanguages(['eng']);
        vi.mocked(resolveAuthContext).mockResolvedValue({
            applicationId: 'api-app',
            applicationKey: 'api.iworkhere.com',
        });
        vi.mocked(resolveUserIdForApplication).mockResolvedValue({
            userId: 'admin-user',
            username: 'admin',
            email: 'admin@example.com',
            role: 'owner',
        });

        mockRepo = {
            deleteById: vi.fn(),
            deleteBySlugAndLang: vi.fn(),
            findBySlug: vi.fn(),
        };

        handler = makeDeleteLocalizationHandler(mockRepo);
    });

    test('requires authentication and an administrative API application role', async () => {
        expect(authRequired).toBe(true);
        const unauthorizedResponse = createMockRes();
        await DELETE({ query: {} } as Request, unauthorizedResponse);
        expect(unauthorizedResponse.statusCode).toBe(401);
        expect(mockRepo.deleteById).not.toHaveBeenCalled();

        vi.mocked(resolveUserIdForApplication).mockResolvedValue({
            userId: 'ordinary-user',
            username: 'ordinary',
            email: 'ordinary@example.com',
            role: 'user',
        });
        const forbiddenResponse = createMockRes();
        await DELETE(
            { ...createMockReq({ id: 'target-id' }), auth: { userId: 'ordinary-user' } } as Request,
            forbiddenResponse,
        );
        expect(forbiddenResponse.statusCode).toBe(403);
        expect(mockRepo.deleteById).not.toHaveBeenCalled();
    });

    test('returns 400 when neither id nor slug is provided', async () => {
        const req = createMockReq({});
        const res = createMockRes();

        await handler(req, res);

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toBe('INVALID_REQUEST');
    });

    test('deletes by id and dirties cache', async () => {
        (mockRepo.deleteById as any).mockResolvedValueOnce(true);

        const req = createMockReq({ id: '11111111-1111-1111-1111-111111111111' });
        const res = createMockRes();

        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(mockRepo.deleteById).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111');
        expect(isCacheDirty()).toBe(true);
    });

    test('returns 404 when id is not found', async () => {
        (mockRepo.deleteById as any).mockResolvedValueOnce(false);

        const req = createMockReq({ id: 'non-existent-id' });
        const res = createMockRes();

        await handler(req, res);

        expect(res.statusCode).toBe(404);
        expect(res.body.error).toBe('NOT_FOUND');
    });

    test('deletes by slug and lang and dirties cache', async () => {
        (mockRepo.deleteBySlugAndLang as any).mockResolvedValueOnce(true);

        const req = createMockReq({ slug: 'username', lang: 'fr' });
        const res = createMockRes();

        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(mockRepo.deleteBySlugAndLang).toHaveBeenCalledWith('username', 'fr');
        expect(isCacheDirty()).toBe(true);
    });

    test('deletes by slug only when exactly 1 match exists', async () => {
        const singleMatch: LocalizationRecord = {
            id: 'match-id',
            slug: 'unique_slug',
            lang: 'eng',
            text: 'Text',
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        (mockRepo.findBySlug as any).mockResolvedValueOnce([singleMatch]);
        (mockRepo.deleteById as any).mockResolvedValueOnce(true);

        const req = createMockReq({ slug: 'unique_slug' });
        const res = createMockRes();

        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(mockRepo.deleteById).toHaveBeenCalledWith('match-id');
        expect(isCacheDirty()).toBe(true);
    });

    test('returns 404 when deleting by slug and lang and record not found', async () => {
        (mockRepo.deleteBySlugAndLang as any).mockResolvedValueOnce(false);

        const req = createMockReq({ slug: 'username', lang: 'es' });
        const res = createMockRes();

        await handler(req, res);

        expect(res.statusCode).toBe(404);
        expect(res.body.error).toBe('NOT_FOUND');
    });

    test('returns 404 when deleting by slug only and record not found', async () => {
        (mockRepo.findBySlug as any).mockResolvedValueOnce([]);

        const req = createMockReq({ slug: 'missing_slug' });
        const res = createMockRes();

        await handler(req, res);

        expect(res.statusCode).toBe(404);
        expect(res.body.error).toBe('NOT_FOUND');
    });

    test('executes default DELETE handler with database queries', async () => {
        const { db } = await import('@services/dbService');

        vi.mocked(db.delete).mockReturnValue({
            where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([{ id: 'uuid-1' }]),
            }),
        } as any);

        const req = createMockReq({ id: 'uuid-1' });
        const res = createMockRes();

        await DELETE(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
    });

    test('executes the default repository slug-and-language delete path', async () => {
        const { db } = await import('@services/dbService');
        vi.mocked(db.delete).mockReturnValue({
            where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([{ id: 'uuid-1' }]),
            }),
        } as any);

        const res = createMockRes();
        await DELETE(createMockReq({ slug: 'welcome', lang: 'eng' }), res);

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ success: true });
    });

    test('executes the default repository slug-only mapping path', async () => {
        const { db } = await import('@services/dbService');
        vi.mocked(db.select).mockReturnValue({
            from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([{
                    id: 'uuid-2', slug: 'welcome', lang: 'eng', languageName: 'English',
                    text: 'Welcome', codepage: 'UTF-8', direction: 'ltr', description: null,
                    createdAt: new Date(), updatedAt: new Date(),
                }]),
            }),
        } as any);
        vi.mocked(db.delete).mockReturnValue({
            where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([{ id: 'uuid-2' }]),
            }),
        } as any);

        const res = createMockRes();
        await DELETE(createMockReq({ slug: 'welcome' }), res);

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ success: true });
    });

    test('returns 409 conflict when deleting by slug only and multiple records match', async () => {
        (mockRepo.findBySlug as any).mockResolvedValueOnce([
            { id: '1', slug: 'dup_slug', lang: 'eng' },
            { id: '2', slug: 'dup_slug', lang: 'fr' },
        ]);

        const req = createMockReq({ slug: 'dup_slug' });
        const res = createMockRes();

        await handler(req, res);

        expect(res.statusCode).toBe(409);
        expect(res.body.error).toBe('CONFLICT');
    });

    test('returns 404 when deleting by slug only and record deletion fails', async () => {
        (mockRepo.findBySlug as any).mockResolvedValueOnce([
            { id: '1', slug: 'dup_slug', lang: 'eng' },
        ]);
        (mockRepo.deleteById as any).mockResolvedValueOnce(false);

        const req = createMockReq({ slug: 'dup_slug' });
        const res = createMockRes();

        await handler(req, res);

        expect(res.statusCode).toBe(404);
        expect(res.body.error).toBe('NOT_FOUND');
    });

    test('returns 500 on unexpected error in handler', async () => {
        (mockRepo.deleteById as any).mockRejectedValueOnce(new Error('crash'));

        const req = createMockReq({ id: 'uuid-1' });
        const res = createMockRes();

        await handler(req, res);

        expect(res.statusCode).toBe(500);
        expect(res.body.error).toBe('INTERNAL_ERROR');
    });

});
