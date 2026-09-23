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
    cleanLanguageCode,
    extractLanguage,
    __test__,
    type LocalizationRecord,
    type LocalizationRepository,
} from '@routes/v1/localization/GET';

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function createReq(
    query: Record<string, unknown> = {},
    headers: Record<string, string> = {},
    cookies: Record<string, string> = {},
): Request {
    return {
        query,
        headers,
        cookies,
        get(header: string) {
            return headers[header.toLowerCase()] || headers[header];
        },
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

    test('normalizes language code formats and rejects empty wildcards', () => {
        expect(cleanLanguageCode(' fr-CA,fr;q=0.9 ')).toBe('fr-CA');
        expect(cleanLanguageCode('fr-CA;q=0.9')).toBe('fr-CA');
        expect(cleanLanguageCode('Language-Hint: can_fr')).toBe('can_fr');
        expect(cleanLanguageCode("'en_ca'")).toBe('en_ca');
        expect(cleanLanguageCode('*')).toBeUndefined();
        expect(cleanLanguageCode(42)).toBeUndefined();
    });

    test('extracts language from a header-like key and returns undefined without a request', () => {
        expect(extractLanguage({
            query: {},
            headers: { 'Language-Hint=can_fr': '' },
        } as unknown as Request)).toBe('can_fr');
        expect(extractLanguage(undefined as unknown as Request)).toBeUndefined();
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

    test('returns non-English language metadata grouped by slug for list requests', async () => {
        const req = createReq({ list: '' });
        const res = createRes();

        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual([
            {
                slug: 'username',
                fallback: 'Enter your username',
                langs: [
                    {
                        id: '22222222-2222-2222-2222-222222222222',
                        slug: 'username',
                        lang: 'fr',
                        language_name: 'French',
                        text: "nom d'utilisateur",
                        codepage: 'UTF-8',
                        direction: 'ltr',
                        description: "Invite demandant à l'utilisateur",
                    },
                ],
            },
        ]);
    });

    test('uses only the selected non-English language for list requests', async () => {
        const req = createReq({ list: '', lang: 'fr' });
        const res = createRes();

        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual([
            {
                slug: 'username',
                fallback: 'Enter your username',
                langs: [
                    {
                        id: '22222222-2222-2222-2222-222222222222',
                        slug: 'username',
                        lang: 'fr',
                        language_name: 'French',
                        text: "nom d'utilisateur",
                        codepage: 'UTF-8',
                        direction: 'ltr',
                        description: "Invite demandant à l'utilisateur",
                    },
                ],
            },
        ]);
    });

    test('limits list requests to the requested slug', async () => {
        const listHandler = makeGetLocalizationHandler({
            ...createMockRepo(),
            getAll: vi.fn(async () => [
                mockRecords[0],
                mockRecords[1],
                {
                    ...mockRecords[1],
                    id: '55555555-5555-5555-5555-555555555555',
                    slug: 'about_content_p1',
                    lang: 'es',
                    languageName: 'Spanish',
                },
            ]),
        });
        const req = createReq({ list: '', slug: 'about_content_p1' });
        const res = createRes();

        await listHandler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual([
            {
                slug: 'about_content_p1',
                fallback: 'default english text here so we can translate to new languages if we need to',
                langs: [
                    {
                        id: '55555555-5555-5555-5555-555555555555',
                        slug: 'about_content_p1',
                        lang: 'es',
                        language_name: 'Spanish',
                        text: mockRecords[1].text,
                        codepage: 'UTF-8',
                        direction: 'ltr',
                        description: mockRecords[1].description,
                    },
                ],
            },
        ]);
    });

    test('returns all non-English records for a slug when all is requested', async () => {
        const slugRecords: LocalizationRecord[] = [
            {
                ...mockRecords[0],
                slug: 'about_content_p1',
            },
            {
                ...mockRecords[1],
                id: '44444444-4444-4444-4444-444444444444',
                slug: 'about_content_p1',
                lang: 'fr_CA',
                languageName: 'French (CA)',
                text: 'Texte français',
                value: 'Texte français',
            },
            {
                ...mockRecords[1],
                id: '55555555-5555-5555-5555-555555555555',
                slug: 'about_content_p1',
                lang: 'es',
                languageName: 'Spanish',
                text: 'Texto español',
                value: 'Texto español',
            },
        ];
        const allHandler = makeGetLocalizationHandler({
            ...createMockRepo(),
            findBySlug: vi.fn(async (slug: string) =>
                slugRecords.filter((record) => record.slug === slug),
            ),
        });
        const req = createReq({ slug: 'about_content_p1', all: '' });
        const res = createRes();

        await allHandler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual([
            {
                slug: 'about_content_p1',
                fallback: 'Enter your username',
                langs: [
                    { ...slugRecords[1], requestedLang: 'fr_CA' },
                    { ...slugRecords[2], requestedLang: 'es' },
                ],
            },
        ]);
        expect(res.body[0].langs).not.toContainEqual(
            expect.objectContaining({ lang: 'eng' }),
        );
        expect(res.body[0].langs[0]).not.toHaveProperty('slugs');
        expect(res.body[0].langs[0]).not.toHaveProperty('slugnames');
    });

    test('groups every non-English language for each slug without legacy fields', async () => {
        const handlerWithAllLanguages = makeGetLocalizationHandler({
            ...createMockRepo(),
            getAll: vi.fn(async () => [
                mockRecords[0],
                mockRecords[1],
                {
                    ...mockRecords[1],
                    id: '44444444-4444-4444-4444-444444444444',
                    lang: 'es',
                    languageName: 'Spanish',
                },
                {
                    ...mockRecords[1],
                    id: '55555555-5555-5555-5555-555555555555',
                    slug: 'welcome_title',
                    lang: 'fr_CA',
                    languageName: 'French (CA)',
                },
            ]),
        });
        const req = createReq({ list: '', lang: 'fr' });
        const res = createRes();

        await handlerWithAllLanguages(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual([
            {
                slug: 'username',
                fallback: 'Enter your username',
                langs: [
                    {
                        id: '22222222-2222-2222-2222-222222222222',
                        slug: 'username',
                        lang: 'fr',
                        language_name: 'French',
                        text: "nom d'utilisateur",
                        codepage: 'UTF-8',
                        direction: 'ltr',
                        description: "Invite demandant à l'utilisateur",
                    },
                    {
                        id: '44444444-4444-4444-4444-444444444444',
                        slug: 'username',
                        lang: 'es',
                        language_name: 'Spanish',
                        text: "nom d'utilisateur",
                        codepage: 'UTF-8',
                        direction: 'ltr',
                        description: "Invite demandant à l'utilisateur",
                    },
                ],
            },
            {
                slug: 'welcome_title',
                fallback: 'default english text here so we can translate to new languages if we need to',
                langs: [
                    {
                        id: '55555555-5555-5555-5555-555555555555',
                        slug: 'welcome_title',
                        lang: 'fr_CA',
                        language_name: 'French (CA)',
                        text: "nom d'utilisateur",
                        codepage: 'UTF-8',
                        direction: 'ltr',
                        description: "Invite demandant à l'utilisateur",
                    },
                ],
            },
        ]);
        expect(res.body).not.toHaveProperty('slugs');
        expect(res.body).not.toHaveProperty('slugnames');
        expect(res.body[0]).not.toHaveProperty('slugs');
        expect(res.body[0]).not.toHaveProperty('slugnames');
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

    test('resolves slug when lang is provided via X-Lang header', async () => {
        const req = createReq(
            { slug: 'username' },
            { 'x-lang': 'en_ca' },
        );
        const res = createRes();

        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.slug).toBe('username');
        expect(res.body.text).toBe('Enter your username');
        expect(res.body.requestedLang).toBe('en_ca');
    });

    test('resolves slug when lang is provided in "X-lang=en_ca" header format', async () => {
        const req = createReq(
            { slug: 'username' },
            { 'x-lang': 'X-lang=en_ca' },
        );
        const res = createRes();

        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.slug).toBe('username');
        expect(res.body.text).toBe('Enter your username');
        expect(res.body.requestedLang).toBe('en_ca');
    });

    test('resolves slug when lang is provided in header key "x-lang=en_ca"', async () => {
        const req = createReq(
            { slug: 'username' },
            { 'x-lang=en_ca': '' },
        );
        const res = createRes();

        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.slug).toBe('username');
        expect(res.body.text).toBe('Enter your username');
        expect(res.body.requestedLang).toBe('en_ca');
    });

    test('resolves slug when lang is provided via X-Language header', async () => {
        const req = createReq(
            { slug: 'username' },
            { 'x-language': 'can_fr' },
        );
        const res = createRes();

        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.slug).toBe('username');
        expect(res.body.text).toBe("nom d'utilisateur");
        expect(res.body.requestedLang).toBe('can_fr');
    });

    test('resolves slug when lang is provided via cookie', async () => {
        const req = createReq(
            { slug: 'username' },
            {},
            { lang: 'can_fr' },
        );
        const res = createRes();

        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.slug).toBe('username');
        expect(res.body.text).toBe("nom d'utilisateur");
        expect(res.body.requestedLang).toBe('can_fr');
    });

    test('resolves slug when lang is provided via Accept-Language header', async () => {
        const req = createReq(
            { slug: 'username' },
            { 'accept-language': 'fr-CA,fr;q=0.9,en-US;q=0.8' },
        );
        const res = createRes();

        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.slug).toBe('username');
        expect(res.body.text).toBe("nom d'utilisateur");
        expect(res.body.requestedLang).toBe('fr-CA');
    });

    test('resolves slug when lang is provided via X-Language-Hint header', async () => {
        const req = createReq(
            { slug: 'username' },
            { 'x-language-hint': 'can_fr' },
        );
        const res = createRes();

        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.slug).toBe('username');
        expect(res.body.text).toBe("nom d'utilisateur");
        expect(res.body.requestedLang).toBe('can_fr');
    });

    test('resolves slug when lang is provided via Language-Hint header', async () => {
        const req = createReq(
            { slug: 'username' },
            { 'language-hint': 'can_fr' },
        );
        const res = createRes();

        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.slug).toBe('username');
        expect(res.body.text).toBe("nom d'utilisateur");
        expect(res.body.requestedLang).toBe('can_fr');
    });

    test('resolves slug when lang is provided via Language header', async () => {
        const req = createReq(
            { slug: 'username' },
            { language: 'can_fr' },
        );
        const res = createRes();

        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.slug).toBe('username');
        expect(res.body.text).toBe("nom d'utilisateur");
        expect(res.body.requestedLang).toBe('can_fr');
    });

    test('resolves slug when lang is provided via language_hint query param', async () => {
        const req = createReq(
            { slug: 'username', language_hint: 'can_fr' },
        );
        const res = createRes();

        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.slug).toBe('username');
        expect(res.body.text).toBe("nom d'utilisateur");
        expect(res.body.requestedLang).toBe('can_fr');
    });

    test('returns slugs list when lang is provided via X-Lang header without slug in query', async () => {
        const req = createReq(
            {},
            { 'x-lang': 'fr' },
        );
        const res = createRes();

        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.lang).toBe('fr');
        expect(res.body.slugs).toBe('username');
        expect(res.body.slugnames).toBe('username');
        expect(repo.findByLang).toHaveBeenCalledWith('fr');
    });

    test('resolves missing slug via fallback query parameter', async () => {
        const req = createReq({
            slug: 'missing_btn',
            lang: 'en_ca',
            fallback: 'Click Here',
        });
        const res = createRes();

        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.slug).toBe('missing_btn');
        expect(res.body.text).toBe('Click Here');
    });

    test('extracts language from cookies and various header formats', async () => {
        const reqWithLocaleCookie = createReq(
            { slug: 'username' },
            {},
            { locale: 'can_fr' }
        );
        const res1 = createRes();
        await handler(reqWithLocaleCookie, res1);
        expect(res1.statusCode).toBe(200);
        expect(res1.body.requestedLang).toBe('can_fr');

        const reqWithXLocaleHeader = createReq(
            { slug: 'username' },
            { 'x-locale': 'can_fr' }
        );
        const res2 = createRes();
        await handler(reqWithXLocaleHeader, res2);
        expect(res2.statusCode).toBe(200);
        expect(res2.body.requestedLang).toBe('can_fr');
    });

    test('executes default GET export with database queries', async () => {
        const { db } = await import('@services/dbService');

        vi.mocked(db.select).mockReturnValue({
            from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue([
                        {
                            id: 'uuid-1',
                            slug: 'test_slug',
                            lang: 'eng',
                            languageName: 'English',
                            text: 'Test Text',
                            codepage: 'UTF-8',
                            direction: 'ltr',
                            description: null,
                            createdAt: new Date(),
                            updatedAt: new Date(),
                        },
                    ]),
                }),
            }),
        } as any);

        const req = createReq({ id: 'uuid-1' });
        const res = createRes();

        await GET(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.slug).toBe('test_slug');
    });

    test('executes the default repository slug-only query and maps records', async () => {
        const { db } = await import('@services/dbService');
        vi.mocked(db.select).mockReturnValue({
            from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                    orderBy: vi.fn().mockResolvedValue([{
                        id: 'slug-id', slug: 'welcome', lang: 'eng', languageName: 'English',
                        text: 'Welcome', codepage: 'UTF-8', direction: 'ltr', description: null,
                        createdAt: new Date(), updatedAt: new Date(),
                    }]),
                }),
            }),
        } as any);

        const res = createRes();
        await GET(createReq({ slug: 'welcome' }), res);

        expect(res.statusCode).toBe(200);
        expect(res.body).toMatchObject({ slug: 'welcome', languages: 'eng', langs: 'eng' });
    });

    test('executes the default repository language-only query and maps records', async () => {
        const { db } = await import('@services/dbService');
        vi.mocked(db.select).mockReturnValue({
            from: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockResolvedValue([{
                    id: 'lang-id', slug: 'welcome', lang: 'eng', languageName: 'English',
                    text: 'Welcome', codepage: 'UTF-8', direction: 'ltr', description: null,
                    createdAt: new Date(), updatedAt: new Date(),
                }]),
            }),
        } as any);

        const res = createRes();
        await GET(createReq({ lang: 'eng' }), res);

        expect(res.statusCode).toBe(200);
        expect(res.body).toMatchObject({ lang: 'eng', slugs: 'welcome', count: 1 });
        expect(res.body.records[0].value).toBe('Welcome');
    });

    test('executes the default repository localized query and maps the matched record', async () => {
        const { db } = await import('@services/dbService');
        vi.mocked(db.select).mockReturnValue({
            from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([{
                    id: 'localized-id', slug: 'welcome', lang: 'eng', languageName: 'English',
                    text: 'Welcome', codepage: 'UTF-8', direction: 'ltr', description: null,
                    createdAt: new Date(), updatedAt: new Date(),
                }]),
            }),
        } as any);

        const res = createRes();
        await GET(createReq({ slug: 'welcome', lang: 'eng' }), res);

        expect(res.statusCode).toBe(200);
        expect(res.body).toMatchObject({ id: 'localized-id', value: 'Welcome', requestedLang: 'eng' });
    });

    test('returns an empty list when the default repository finds no slug records', async () => {
        const { db } = await import('@services/dbService');
        vi.mocked(db.select).mockReturnValue({
            from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                    orderBy: vi.fn().mockResolvedValue([]),
                }),
            }),
        } as any);

        await expect(__test__.dbLocalizationRepository.findBySlug('missing_slug'))
            .resolves.toEqual([]);
    });

    test('falls back to an English record in the default repository when the requested language is unavailable', async () => {
        const { db } = await import('@services/dbService');
        vi.mocked(db.select).mockReturnValue({
            from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([{
                    id: 'english-id', slug: 'welcome', lang: 'eng', languageName: 'English',
                    text: 'Welcome', codepage: 'UTF-8', direction: 'ltr', description: null,
                    createdAt: new Date(), updatedAt: new Date(),
                }]),
            }),
        } as any);

        await expect(__test__.dbLocalizationRepository.findBySlugAndLang('welcome', 'de'))
            .resolves.toMatchObject({ lang: 'de', value: 'Welcome' });
    });

    test('maps all records from the default repository getAll method', async () => {
        const { db } = await import('@services/dbService');
        vi.mocked(db.select).mockReturnValue({
            from: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockResolvedValue([{
                    id: 'all-id', slug: 'welcome', lang: 'eng', languageName: 'English',
                    text: 'Welcome', codepage: 'UTF-8', direction: 'ltr', description: null,
                    createdAt: new Date(), updatedAt: new Date(),
                }]),
            }),
        } as any);

        await expect(__test__.dbLocalizationRepository.getAll())
            .resolves.toEqual([expect.objectContaining({ id: 'all-id', value: 'Welcome' })]);
    });

    test('returns no record when the default repository has no English fallback', async () => {
        const { db } = await import('@services/dbService');
        vi.mocked(db.select).mockReturnValue({
            from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([{
                    id: 'french-id', slug: 'bonjour', lang: 'fr', languageName: 'French',
                    text: 'Bonjour', codepage: 'UTF-8', direction: 'ltr', description: null,
                    createdAt: new Date(), updatedAt: new Date(),
                }]),
            }),
        } as any);

        await expect(__test__.dbLocalizationRepository.findBySlugAndLang('bonjour', 'de'))
            .resolves.toBeNull();
    });

    test('returns null when the default repository has no rows at all', async () => {
        const { db } = await import('@services/dbService');
        vi.mocked(db.select).mockReturnValue({
            from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([]),
            }),
        } as any);

        await expect(__test__.dbLocalizationRepository.findBySlugAndLang('unknown_slug', 'de'))
            .resolves.toBeNull();
    });

    test('handles batch slug queries with lang', async () => {
        const req = createReq({
            slug: 'username,welcome_title',
            lang: 'eng',
        });
        const res = createRes();

        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.count).toBe(2);
        expect(res.body.records).toHaveLength(2);
    });

    test('handles array slug queries and omits unresolved records from batch results', async () => {
        const req = createReq({
            slug: ['username', 'missing_slug'],
            lang: 'eng',
        });
        const res = createRes();

        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.count).toBe(1);
        expect(res.body.records[0].slug).toBe('username');
    });

    test('writes a resolved translation to cache before returning it', async () => {
        const resolved: LocalizationRecord = {
            ...mockRecords[0],
            slug: 'cache_write_slug',
            text: 'Cached after lookup',
        };
        repo.findBySlugAndLang = vi.fn().mockResolvedValue(resolved);
        const req = createReq({ slug: 'cache_write_slug', lang: 'eng' });
        const res = createRes();

        await handler(req, res);
        const { cacheStore } = await import('@cache/cacheStore');

        expect(res.statusCode).toBe(200);
        expect((await cacheStore.get('localization:cache_write_slug:eng'))?.text)
            .toBe('Cached after lookup');
    });

    test('retrieves translation from cacheStore when available', async () => {
        const { cacheStore } = await import('@cache/cacheStore');
        await cacheStore.set('localization:cached_slug:eng', {
            id: 'cached-id',
            slug: 'cached_slug',
            lang: 'eng',
            text: 'Cached translation',
            createdAt: new Date(),
            updatedAt: new Date(),
        }, 60000);

        const req = createReq({
            slug: 'cached_slug',
            lang: 'eng',
        });
        const res = createRes();

        await handler(req, res);

        expect(res.statusCode).toBe(200);
        expect(res.body.text).toBe('Cached translation');
    });

    test('uses the explicit fallback resolver when the repository has no match', async () => {
        const { cacheStore } = await import('@cache/cacheStore');
        await cacheStore.clear();

        const fallbackHandler = makeGetLocalizationHandler({
            getById: vi.fn(),
            findBySlug: vi.fn(),
            findBySlugAndLang: vi.fn().mockResolvedValue(null),
            findByLang: vi.fn(),
            getAll: vi.fn(),
        });
        const res = createRes();

        await fallbackHandler(createReq({
            slug: 'fallback_unique_slug',
            lang: 'fr',
            fallback: 'Fallback source text',
        }), res);

        expect(res.statusCode).toBe(200);
        expect(res.body.requestedLang).toBe('fr');
        expect(res.body.value).toBeDefined();
    });

    test('returns 500 on unexpected errors in handler', async () => {
        const errorRepo: LocalizationRepository = {
            getById: vi.fn(),
            findBySlug: vi.fn(),
            findBySlugAndLang: vi.fn().mockRejectedValue(new Error('boom')),
            findByLang: vi.fn(),
            getAll: vi.fn(),
        };
        const errHandler = makeGetLocalizationHandler(errorRepo);

        const req = createReq({
            slug: 'crash_slug',
            lang: 'eng',
        });
        const res = createRes();

        await errHandler(req, res);

        expect(res.statusCode).toBe(500);
        expect(res.body.error).toBe('INTERNAL_ERROR');
    });
});
