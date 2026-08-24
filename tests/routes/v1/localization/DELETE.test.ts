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

import DELETE, {
    makeDeleteLocalizationHandler,
    type LocalizationDeleteRepository,
} from '@routes/v1/localization/DELETE';
import { isCacheDirty, setCachedSupportedLanguages } from '@cache/localizationCache';
import type { LocalizationRecord } from '@routes/v1/localization/GET';

function createMockReq(query: Record<string, unknown>): Request {
    return {
        query,
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

        mockRepo = {
            deleteById: vi.fn(),
            deleteBySlugAndLang: vi.fn(),
            findBySlug: vi.fn(),
        };

        handler = makeDeleteLocalizationHandler(mockRepo);
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

    test('returns 409 CONFLICT when deleting by slug only and multiple languages exist', async () => {
        const match1: LocalizationRecord = {
            id: 'match-1',
            slug: 'username',
            lang: 'eng',
            text: 'Username',
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        const match2: LocalizationRecord = {
            id: 'match-2',
            slug: 'username',
            lang: 'fr',
            text: "Nom d'utilisateur",
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        (mockRepo.findBySlug as any).mockResolvedValueOnce([match1, match2]);

        const req = createMockReq({ slug: 'username' });
        const res = createMockRes();

        await handler(req, res);

        expect(res.statusCode).toBe(409);
        expect(res.body.error).toBe('CONFLICT');
    });
});
