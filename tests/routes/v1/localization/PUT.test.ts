/**
 * @myDocBlock v2.3
 * @file PUT.test.ts
 * @internal
 * @module tests/routes/v1/localization
 * @tag localization, test
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path tests/routes/v1/localization/PUT.test.ts
 * @summary Unit tests for PUT /v1/localization.
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

import PUT, {
    makePutLocalizationHandler,
    upsertLocalization,
    schema,
    type LocalizationWriteRepository,
} from '@routes/v1/localization/PUT';
import { isCacheDirty, setCachedSupportedLanguages } from '@cache/localizationCache';
import type { LocalizationRecord } from '@routes/v1/localization/GET';

function createMockReq(body: any): Request {
    return {
        body,
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

describe('PUT /v1/localization', () => {
    let mockRepo: LocalizationWriteRepository;
    let handler: (req: Request, res: Response) => Promise<any>;

    beforeEach(() => {
        vi.clearAllMocks();
        setCachedSupportedLanguages(['eng']);

        mockRepo = {
            findBySlugAndLang: vi.fn(),
            getById: vi.fn(),
            insert: vi.fn(),
            update: vi.fn(),
        };

        handler = makePutLocalizationHandler(mockRepo);
    });

    test('validates schema correctly', () => {
        const valid = schema.body.safeParse({
            slug: 'welcome_title',
            lang: 'en_ca',
            text: 'Welcome to Canada',
        });
        expect(valid.success).toBe(true);

        const invalidMissingSlug = schema.body.safeParse({
            lang: 'en_ca',
            text: 'Welcome',
        });
        expect(invalidMissingSlug.success).toBe(false);

        const invalidMissingLang = schema.body.safeParse({
            slug: 'welcome',
            text: 'Welcome',
        });
        expect(invalidMissingLang.success).toBe(false);
    });

    test('inserts a new record and dirties cache when record does not exist', async () => {
        (mockRepo.findBySlugAndLang as any).mockResolvedValueOnce(null);
        (mockRepo.insert as any).mockResolvedValueOnce({
            id: 'generated-uuid',
            slug: 'welcome_title',
            lang: 'en_ca',
            text: 'Welcome to Canada',
            languageName: 'Canadian English',
            codepage: 'UTF-8',
            direction: 'ltr',
            description: null,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        const req = createMockReq({
            slug: 'welcome_title',
            lang: 'en_ca',
            text: 'Welcome to Canada',
            languageName: 'Canadian English',
        });
        const res = createMockRes();

        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.slug).toBe('welcome_title');
        expect(res.body.lang).toBe('en_ca');
        expect(mockRepo.insert).toHaveBeenCalled();
        expect(isCacheDirty()).toBe(true);
    });

    test('updates existing record and dirties cache when record exists', async () => {
        const existing: LocalizationRecord = {
            id: 'existing-id',
            slug: 'username',
            lang: 'eng',
            text: 'Old Text',
            languageName: 'English',
            codepage: 'UTF-8',
            direction: 'ltr',
            description: null,
            createdAt: new Date('2026-01-01'),
            updatedAt: new Date('2026-01-01'),
        };

        (mockRepo.findBySlugAndLang as any).mockResolvedValueOnce(existing);
        (mockRepo.update as any).mockResolvedValueOnce({
            ...existing,
            text: 'Enter your updated username',
            updatedAt: new Date(),
        });

        const req = createMockReq({
            slug: 'username',
            lang: 'eng',
            text: 'Enter your updated username',
        });
        const res = createMockRes();

        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.text).toBe('Enter your updated username');
        expect(mockRepo.update).toHaveBeenCalledWith('existing-id', expect.objectContaining({
            text: 'Enter your updated username',
        }));
        expect(isCacheDirty()).toBe(true);
    });

    test('returns 400 validation error when body is invalid', async () => {
        const req = createMockReq({
            slug: '',
        });
        const res = createMockRes();

        await handler(req, res);

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toBe('VALIDATION_ERROR');
    });
});
