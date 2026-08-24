/**
 * @myDocBlock v2.3
 * @file GET.test.ts
 * @internal
 * @module tests/routes/v1/localization
 * @tag localization, test
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path tests/routes/v1/localization/GET.test.ts
 * @summary Unit tests for GET /v1/localization.
 *
 * @description
 * Verifies that GET /v1/localization enforces deterministic resolution:
 *   - returns all records when no query params are provided
 *   - returns a single record by id
 *   - resolves a localized record by slug and language code (en_ca, can_fr, en_us, etc.)
 *   - supports fallback to base languages and default English
 *   - returns all records for a given language tag
 *   - rejects invalid query parameter combinations (id + slug/lang)
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

/* ------------------------------------------------------------------ */
/* Mocks                                                              */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* Imports                                                            */
/* ------------------------------------------------------------------ */

import GET, {
    makeGetLocalizationHandler,
    getLanguageCandidates,
    type LocalizationRecord,
    type LocalizationRepository,
} from '@routes/v1/localization/GET';

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function createReq(query: Record<string, unknown>): Request {
    return {
        query,
    } as unknown as Request;
}

type ResMock = Response & {
    statusCode: number;
    body?: any;
};

function createRes(): ResMock {
    const res = {
        statusCode: 0,
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

const mockRecords: LocalizationRecord[] = [
    {
        id: '11111111-1111-1111-1111-111111111111',
        slug: 'username',
        lang: 'eng',
        languageName: 'English',
        text: 'Enter your username',
        value: 'Enter your username',
        codepage: 'UTF-8',
        direction: 'ltr',
        description: 'Prompt asking user to enter their username',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
    {
        id: '22222222-2222-2222-2222-222222222222',
        slug: 'username',
        lang: 'fr',
        languageName: 'French',
        text: "nom d'utilisateur",
        value: "nom d'utilisateur",
        codepage: 'UTF-8',
        direction: 'ltr',
        description: "Invite demandant à l'utilisateur",
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
    {
        id: '33333333-3333-3333-3333-333333333333',
        slug: 'welcome_title',
        lang: 'en_ca',
        languageName: 'Canadian English',
        text: 'Welcome to Canada',
        value: 'Welcome to Canada',
        codepage: 'UTF-8',
        direction: 'ltr',
        description: 'Welcome heading',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
];

function createMockRepo(): LocalizationRepository {
    return {
        getById: vi.fn(async (id: string) => {
            return mockRecords.find((r) => r.id === id) || null;
        }),
        findBySlug: vi.fn(async (slug: string) => {
            return mockRecords.filter((r) => r.slug === slug);
        }),
        findBySlugAndLang: vi.fn(async (slug: string, lang: string) => {
            const rows = mockRecords.filter((r) => r.slug === slug);
            if (rows.length === 0) return null;
            const candidates = getLanguageCandidates(lang);
            for (const cand of candidates) {
                const found = rows.find(
                    (r) =>
                        r.lang === cand ||
                        r.lang.toLowerCase() === cand.toLowerCase() ||
                        r.lang.toLowerCase().replace(/-/g, '_') ===
                            cand.toLowerCase().replace(/-/g, '_'),
                );
                if (found) return found;
            }
            const enFallback = rows.find(
                (r) =>
                    r.lang.toLowerCase().startsWith('en') ||
                    r.lang.toLowerCase() === 'eng',
            );
            return enFallback || rows[0];
        }),
        findByLang: vi.fn(async (lang: string) => {
            const candidates = getLanguageCandidates(lang);
            return mockRecords.filter((r) =>
                candidates.some(
                    (c) =>
                        r.lang === c ||
                        r.lang.toLowerCase() === c.toLowerCase() ||
                        r.lang.toLowerCase().replace(/-/g, '_') ===
                            c.toLowerCase().replace(/-/g, '_'),
                ),
            );
        }),
        getAll: vi.fn(async () => mockRecords),
    };
}

/* ------------------------------------------------------------------ */
/* Tests                                                              */
/* ------------------------------------------------------------------ */

describe('GET /v1/localization', () => {
    let repo: LocalizationRepository;
    let handler: (req: Request, res: Response) => Promise<any>;

    beforeEach(() => {
        repo = createMockRepo();
        handler = makeGetLocalizationHandler(repo);
    });

    test('getLanguageCandidates generates valid resolution order for Canadian English', () => {
        const candidates = getLanguageCandidates('en_ca');
        expect(candidates).toContain('en-CA');
        expect(candidates).toContain('en_ca');
        expect(candidates).toContain('eng');
        expect(candidates).toContain('en');
    });

    test('getLanguageCandidates generates valid resolution order for Canadian French', () => {
        const candidates = getLanguageCandidates('can_fr');
        expect(candidates).toContain('can_fr');
        expect(candidates).toContain('fr-CA');
        expect(candidates).toContain('fr');
    });

    test('getLanguageCandidates generates valid resolution order for US English', () => {
        const candidates = getLanguageCandidates('en_us');
        expect(candidates).toContain('en-US');
        expect(candidates).toContain('en_us');
        expect(candidates).toContain('eng');
        expect(candidates).toContain('en');
    });

    test('returns 400 when no query parameters are provided', async () => {
        const req = createReq({});
        const res = createRes();

        await handler(req, res);

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toBe('INVALID_REQUEST');
        expect(res.body.message).toBe(
            'Must provide either slug or lang as a minimum',
        );
    });

    test('fetches exact record by id', async () => {
        const req = createReq({ id: '11111111-1111-1111-1111-111111111111' });
        const res = createRes();

        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.slug).toBe('username');
        expect(res.body.text).toBe('Enter your username');
    });

    test('returns 404 when id is not found', async () => {
        const req = createReq({ id: '99999999-9999-9999-9999-999999999999' });
        const res = createRes();

        await handler(req, res);

        expect(res.statusCode).toBe(404);
        expect(res.body.error).toBe('NOT_FOUND');
    });

    test('rejects combining id with slug or lang', async () => {
        const req = createReq({
            id: '11111111-1111-1111-1111-111111111111',
            slug: 'username',
        });
        const res = createRes();

        await handler(req, res);

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toBe('INVALID_REQUEST');
    });

    test('returns slug and comma-delimited list of supported languages when only slug is provided', async () => {
        const req = createReq({ slug: 'username' });
        const res = createRes();

        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.slug).toBe('username');
        expect(res.body.languages).toBe('eng,fr');
        expect(res.body.langs).toBe('eng,fr');
        expect(repo.findBySlug).toHaveBeenCalledWith('username');
    });

    test('returns 404 when querying only slug that does not exist', async () => {
        const req = createReq({ slug: 'non_existent_slug' });
        const res = createRes();

        await handler(req, res);

        expect(res.statusCode).toBe(404);
        expect(res.body.error).toBe('NOT_FOUND');
    });

    test('returns lang and comma-delimited list of supported slugnames when only lang is provided', async () => {
        const req = createReq({ lang: 'fr' });
        const res = createRes();

        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.lang).toBe('fr');
        expect(res.body.slugs).toBe('username');
        expect(res.body.slugnames).toBe('username');
        expect(repo.findByLang).toHaveBeenCalledWith('fr');
    });

    test('returns 404 when querying only lang with no matching records', async () => {
        const req = createReq({ lang: 'non_existent_lang' });
        const res = createRes();

        await handler(req, res);

        expect(res.statusCode).toBe(404);
        expect(res.body.error).toBe('NOT_FOUND');
    });

    test('resolves slug with canadian english (en_ca) when both slug and lang are provided', async () => {
        const req = createReq({ slug: 'username', lang: 'en_ca' });
        const res = createRes();

        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.slug).toBe('username');
        expect(res.body.text).toBe('Enter your username');
        expect(res.body.requestedLang).toBe('en_ca');
    });

    test('resolves slug with canadian french (can_fr) when both slug and lang are provided', async () => {
        const req = createReq({ slug: 'username', lang: 'can_fr' });
        const res = createRes();

        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.slug).toBe('username');
        expect(res.body.text).toBe("nom d'utilisateur");
        expect(res.body.requestedLang).toBe('can_fr');
    });

    test('resolves slug with us english (en_us) when both slug and lang are provided', async () => {
        const req = createReq({ slug: 'username', lang: 'en_us' });
        const res = createRes();

        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.slug).toBe('username');
        expect(res.body.text).toBe('Enter your username');
        expect(res.body.requestedLang).toBe('en_us');
    });

    test('returns 404 when both slug and lang are provided but slug does not exist', async () => {
        const req = createReq({
            slug: 'non_existent_slug',
            lang: 'en_ca',
        });
        const res = createRes();

        await handler(req, res);

        expect(res.statusCode).toBe(404);
        expect(res.body.error).toBe('NOT_FOUND');
    });
});
