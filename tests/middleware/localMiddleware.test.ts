/**
 * @myDocBlock v2.3
 * @file localMiddleware.test.ts
 * @internal
 * @module tests/middleware
 * @tag localization, middleware, test
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path tests/middleware/localMiddleware.test.ts
 * @summary Unit tests for localMiddleware and localization functions.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

/* ------------------------------------------------------------------ */
/* Mocks                                                              */
/* ------------------------------------------------------------------ */

vi.mock('@services/dbService', async () => {
    const { createDbServiceMock } = await import('../helpers/dbMock');
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

import {
    localMiddleware,
    getLocalization,
    localize,
    resolveLanguage,
    setLocalizationRepository,
    resetLocalizationRepository,
} from '@middleware/localMiddleware';
import type {
    LocalizationRecord,
    LocalizationRepository,
} from '@routes/v1/localization/GET';

/* ------------------------------------------------------------------ */
/* Fixtures                                                           */
/* ------------------------------------------------------------------ */

const mockRecords: LocalizationRecord[] = [
    {
        id: '1',
        slug: 'username',
        lang: 'eng',
        text: 'Enter your username',
        languageName: 'English',
        createdAt: new Date(),
        updatedAt: new Date(),
    },
    {
        id: '2',
        slug: 'username',
        lang: 'fr',
        text: "nom d'utilisateur",
        languageName: 'French',
        createdAt: new Date(),
        updatedAt: new Date(),
    },
    {
        id: '3',
        slug: 'welcome_message',
        lang: 'en_ca',
        text: 'Welcome to our Canadian portal',
        languageName: 'Canadian English',
        createdAt: new Date(),
        updatedAt: new Date(),
    },
    {
        id: '4',
        slug: 'welcome_message',
        lang: 'can_fr',
        text: 'Bienvenue sur notre portail canadien',
        languageName: 'Canadian French',
        createdAt: new Date(),
        updatedAt: new Date(),
    },
    {
        id: '5',
        slug: 'welcome_message',
        lang: 'en_us',
        text: 'Welcome to our US portal',
        languageName: 'US English',
        createdAt: new Date(),
        updatedAt: new Date(),
    },
];

function createMockRepo(): LocalizationRepository {
    return {
        getById: vi.fn(async (id: string) => mockRecords.find((r) => r.id === id) || null),
        findBySlug: vi.fn(async (slug: string) => mockRecords.filter((r) => r.slug === slug)),
        findBySlugAndLang: vi.fn(async (slug: string, lang: string) => {
            const rows = mockRecords.filter((r) => r.slug === slug);
            if (rows.length === 0) return null;

            // Direct or dialect match
            const lowerLang = lang.toLowerCase();
            const foundExact = rows.find((r) => r.lang.toLowerCase() === lowerLang);
            if (foundExact) return foundExact;

            // Mapping for canadian french (can_fr / fr_ca -> fr)
            if (lowerLang === 'can_fr' || lowerLang === 'fr_ca' || lowerLang === 'fr-ca') {
                const foundFr = rows.find((r) => r.lang === 'can_fr' || r.lang === 'fr_ca' || r.lang === 'fr');
                if (foundFr) return foundFr;
            }

            // Mapping for canadian english (en_ca -> eng / en)
            if (lowerLang === 'en_ca' || lowerLang === 'en-ca') {
                const foundEn = rows.find((r) => r.lang === 'en_ca' || r.lang === 'eng' || r.lang === 'en');
                if (foundEn) return foundEn;
            }

            // Mapping for us english (en_us -> eng / en)
            if (lowerLang === 'en_us' || lowerLang === 'en-us') {
                const foundUs = rows.find((r) => r.lang === 'en_us' || r.lang === 'eng' || r.lang === 'en');
                if (foundUs) return foundUs;
            }

            // General fallback
            const enFallback = rows.find((r) => r.lang.startsWith('en') || r.lang === 'eng');
            return enFallback || rows[0];
        }),
        findByLang: vi.fn(async (lang: string) => mockRecords.filter((r) => r.lang === lang)),
        getAll: vi.fn(async () => mockRecords),
    };
}

/* ------------------------------------------------------------------ */
/* Tests                                                              */
/* ------------------------------------------------------------------ */

describe('localMiddleware', () => {
    beforeEach(() => {
        setLocalizationRepository(createMockRepo());
    });

    afterEach(() => {
        resetLocalizationRepository();
    });

    describe('getLocalization function', () => {
        test('resolves canadian english (en_ca) strings', async () => {
            const text = await getLocalization('welcome_message', 'en_ca');
            expect(text).toBe('Welcome to our Canadian portal');

            const fallbackToEng = await getLocalization('username', 'en_ca');
            expect(fallbackToEng).toBe('Enter your username');
        });

        test('resolves canadian french (can_fr) strings', async () => {
            const text = await getLocalization('welcome_message', 'can_fr');
            expect(text).toBe('Bienvenue sur notre portail canadien');

            const fallbackToFr = await getLocalization('username', 'can_fr');
            expect(fallbackToFr).toBe("nom d'utilisateur");
        });

        test('resolves us english (en_us) strings', async () => {
            const text = await getLocalization('welcome_message', 'en_us');
            expect(text).toBe('Welcome to our US portal');

            const fallbackToEng = await getLocalization('username', 'en_us');
            expect(fallbackToEng).toBe('Enter your username');
        });

        test('returns fallbackText or slug if translation not found', async () => {
            const notFound = await getLocalization('missing_slug', 'en_ca');
            expect(notFound).toBe('missing_slug');

            const withCustomFallback = await getLocalization(
                'missing_slug',
                'en_ca',
                'Default Title',
            );
            expect(withCustomFallback).toBe('Default Title');
        });

        test('localize is an alias of getLocalization', async () => {
            const text = await localize('username', 'fr');
            expect(text).toBe("nom d'utilisateur");
        });
    });

    describe('polymorphic localMiddleware call', () => {
        test('can be called directly as localMiddleware(slug, lang)', async () => {
            const result = await localMiddleware('username', 'fr');
            expect(result).toBe("nom d'utilisateur");
        });
    });

    describe('resolveLanguage helper', () => {
        test('resolves from req.query.lang', () => {
            const req = { query: { lang: 'en_ca' } } as unknown as Request;
            expect(resolveLanguage(req)).toBe('en_ca');
        });

        test('resolves from custom X-Lang header', () => {
            const req = { headers: { 'x-lang': 'can_fr' } } as unknown as Request;
            expect(resolveLanguage(req)).toBe('can_fr');
        });

        test('resolves from X-lang=en_ca header format', () => {
            const req = { headers: { 'x-lang': 'X-lang=en_ca' } } as unknown as Request;
            expect(resolveLanguage(req)).toBe('en_ca');
        });

        test('resolves from header key formatted as x-lang=en_ca', () => {
            const req = { headers: { 'x-lang=en_ca': '' } } as unknown as Request;
            expect(resolveLanguage(req)).toBe('en_ca');
        });

        test('resolves from custom X-Language header', () => {
            const req = { headers: { 'x-language': 'en_us' } } as unknown as Request;
            expect(resolveLanguage(req)).toBe('en_us');
        });

        test('resolves from req.query x-lang param', () => {
            const req = { query: { 'x-lang': 'en_ca' } } as unknown as Request;
            expect(resolveLanguage(req)).toBe('en_ca');
        });

        test('resolves from cookies', () => {
            const req = { cookies: { lang: 'fr' } } as unknown as Request;
            expect(resolveLanguage(req)).toBe('fr');
        });

        test('resolves from Accept-Language header', () => {
            const req = {
                headers: { 'accept-language': 'fr-CA,fr;q=0.9,en-US;q=0.8' },
            } as unknown as Request;
            expect(resolveLanguage(req)).toBe('fr-CA');
        });

        test('resolves from X-Language-Hint header', () => {
            const req = {
                headers: { 'x-language-hint': 'can_fr' },
            } as unknown as Request;
            expect(resolveLanguage(req)).toBe('can_fr');
        });

        test('resolves from Language-Hint header', () => {
            const req = {
                headers: { 'language-hint': 'can_fr' },
            } as unknown as Request;
            expect(resolveLanguage(req)).toBe('can_fr');
        });

        test('resolves from Language header', () => {
            const req = {
                headers: { language: 'can_fr' },
            } as unknown as Request;
            expect(resolveLanguage(req)).toBe('can_fr');
        });

        test('resolves from Content-Language header', () => {
            const req = {
                headers: { 'content-language': 'can_fr' },
            } as unknown as Request;
            expect(resolveLanguage(req)).toBe('can_fr');
        });

        test('resolves from language_hint query param', () => {
            const req = {
                query: { language_hint: 'can_fr' },
            } as unknown as Request;
            expect(resolveLanguage(req)).toBe('can_fr');
        });

        test('defaults to en when no indicators are present', () => {
            const req = { headers: {}, query: {} } as unknown as Request;
            expect(resolveLanguage(req)).toBe('en');
        });
    });

    describe('Express middleware integration', () => {
        test('populates req and res.locals with localization helpers', async () => {
            const req = {
                query: { lang: 'can_fr' },
                headers: {},
            } as unknown as Request;
            const res = { locals: {} } as unknown as Response;
            const next = vi.fn() as NextFunction;

            const mw = localMiddleware();
            await mw(req, res, next);

            expect(next).toHaveBeenCalled();
            expect(req.lang).toBe('can_fr');
            expect(res.locals.lang).toBe('can_fr');

            // Test attached translation function
            const translated = await req.t?.('username');
            expect(translated).toBe("nom d'utilisateur");

            const translatedFromLocals = await res.locals.t?.('welcome_message');
            expect(translatedFromLocals).toBe('Bienvenue sur notre portail canadien');
        });
    });
});
