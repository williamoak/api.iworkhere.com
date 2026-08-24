/**
 * @myDocBlock v2.3
 * @file localizationCache.test.ts
 * @internal
 * @module tests/cache
 * @tag localization, cache, test
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path tests/cache/localizationCache.test.ts
 * @summary Unit tests for centralized LocalizationCache in src/cache.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';

const { mockSelectResult } = vi.hoisted(() => ({
    mockSelectResult: vi.fn(),
}));

vi.mock('drizzle-orm', () => ({
    asc: vi.fn((col) => col),
    eq: vi.fn(),
    and: vi.fn(),
}));

vi.mock('@services/dbService', () => ({
    db: {
        select: vi.fn(() => ({
            from: vi.fn(() => ({
                orderBy: vi.fn(() => mockSelectResult()),
            })),
        })),
    },
}));

vi.mock('@db/schema/localizations', () => ({
    localizations: {
        id: 'id',
        slug: 'slug',
        lang: 'lang',
    },
}));

import {
    LocalizationCache,
    localizationCache,
    getSupportedLanguages,
    getSupportedSlugs,
    refreshCache,
    dirtyCache,
    invalidateCache,
    isCacheDirty,
    setCachedSupportedLanguages,
    setCachedSupportedSlugs,
    getLanguageCandidates,
    resetLocalizationCache,
} from '@cache/localizationCache';
import { cacheStore } from '@cache/cacheStore';

describe('LocalizationCache in @cache', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetLocalizationCache();
    });

    test('cacheStore.localization references the singleton localizationCache', () => {
        expect(cacheStore.localization).toBe(localizationCache);
    });

    test('initial state is dirty', () => {
        expect(isCacheDirty()).toBe(true);
        expect(localizationCache.isDirty()).toBe(true);
    });

    test('refreshes supported languages and slugs from DB', async () => {
        mockSelectResult.mockResolvedValueOnce([
            { slug: 'username', lang: 'eng' },
            { slug: 'username', lang: 'fr' },
            { slug: 'password', lang: 'eng' },
            { slug: 'welcome', lang: 'es_mx' },
        ]);

        const { languages, slugs } = await refreshCache();

        expect(languages).toEqual(['eng', 'fr', 'es_mx']);
        expect(slugs).toEqual(['username', 'password', 'welcome']);
        expect(isCacheDirty()).toBe(false);
    });

    test('getSupportedLanguages re-queries DB when dirty, then caches result', async () => {
        mockSelectResult.mockResolvedValueOnce([
            { slug: 'username', lang: 'eng' },
            { slug: 'username', lang: 'can_fr' },
        ]);

        const langs1 = await getSupportedLanguages();
        expect(langs1).toEqual(['eng', 'can_fr']);
        expect(mockSelectResult).toHaveBeenCalledTimes(1);

        // Second call should return cached result without querying DB
        const langs2 = await getSupportedLanguages();
        expect(langs2).toEqual(['eng', 'can_fr']);
        expect(mockSelectResult).toHaveBeenCalledTimes(1);

        // Dirtying cache triggers re-query on next read
        dirtyCache();
        expect(isCacheDirty()).toBe(true);

        mockSelectResult.mockResolvedValueOnce([
            { slug: 'username', lang: 'eng' },
            { slug: 'username', lang: 'can_fr' },
            { slug: 'username', lang: 'de' },
        ]);

        const langs3 = await getSupportedLanguages();
        expect(langs3).toEqual(['eng', 'can_fr', 'de']);
        expect(mockSelectResult).toHaveBeenCalledTimes(2);
    });

    test('getSupportedSlugs re-queries DB when dirty', async () => {
        mockSelectResult.mockResolvedValueOnce([
            { slug: 'username', lang: 'eng' },
            { slug: 'submit_btn', lang: 'eng' },
        ]);

        const slugs = await getSupportedSlugs();
        expect(slugs).toEqual(['username', 'submit_btn']);
        expect(isCacheDirty()).toBe(false);
    });

    test('invalidateCache and reset work as expected', () => {
        setCachedSupportedLanguages(['eng', 'fr']);
        expect(isCacheDirty()).toBe(false);

        invalidateCache();
        expect(isCacheDirty()).toBe(true);

        setCachedSupportedSlugs(['slug1']);
        expect(isCacheDirty()).toBe(false);

        resetLocalizationCache();
        expect(isCacheDirty()).toBe(true);
        expect(localizationCache.getState().supportedLanguages).toEqual([]);
        expect(localizationCache.getState().supportedSlugs).toEqual([]);
    });

    test('LocalizationCache instance can be instantiated independently', () => {
        const customCache = new LocalizationCache();
        expect(customCache.isDirty()).toBe(true);
        customCache.setSupportedLanguages(['de', 'it']);
        expect(customCache.isDirty()).toBe(false);
        expect(customCache.getState().supportedLanguages).toEqual(['de', 'it']);
    });

    test('dynamically resolves language candidates against available languages', () => {
        const available = ['eng', 'fr-CA', 'es_MX', 'ja'];

        // Spanish Mexican query against available languages
        const esCandidates = getLanguageCandidates('es-mx', available);
        expect(esCandidates).toContain('es_MX');
        expect(esCandidates).toContain('es-mx');

        // Japanese query against available languages
        const jaCandidates = getLanguageCandidates('jpn', available);
        expect(jaCandidates).toContain('ja');

        // Canadian French query against available languages
        const canFrCandidates = getLanguageCandidates('can_fr', available);
        expect(canFrCandidates).toContain('fr-CA');
    });
});
