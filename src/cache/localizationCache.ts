/**
 * @myDocBlock v2.3
 * @file localizationCache.ts
 * @internal
 * @module cache/localizationCache
 * @tag localization, cache
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path src/cache/localizationCache.ts
 * @summary In-memory cache for localization supported languages and slugnames.
 *
 * @description
 * Maintains in-memory cached sets of supported language codes and slugnames
 * dynamically queried from the localizations table. Dirty flags are tripped
 * on PUT and DELETE mutations so memory state remains synchronized with the DB
 * without hard-coded dialect or language lists.
 *
 * @requires
 * {
 *   "tables": ["localizations"],
 *   "services": ["dbService"]
 * }
 */

import { asc } from 'drizzle-orm';
import { db } from '@services/dbService';
import { localizations } from '@db/schema/localizations';
import { logger } from '@helpers/logger';

/* ------------------------------------------------------------------ */
/* Cache State & Types                                                */
/* ------------------------------------------------------------------ */

export interface LocalizationCacheState {
    supportedLanguages: string[];
    supportedSlugs: string[];
    isDirty: boolean;
    lastRefreshedAt: Date | null;
}

const ISO_639_EQUIVALENCES: Record<string, string[]> = {
    en: ['eng'],
    eng: ['en'],
    fr: ['fra', 'fre'],
    fra: ['fr', 'fre'],
    fre: ['fr', 'fra'],
    es: ['spa'],
    spa: ['es'],
    de: ['deu', 'ger'],
    deu: ['de', 'ger'],
    ger: ['de', 'deu'],
    it: ['ita'],
    ita: ['it'],
    pt: ['por'],
    por: ['pt'],
    zh: ['zho', 'chi'],
    zho: ['zh', 'chi'],
    chi: ['zh', 'zho'],
    ja: ['jpn'],
    jpn: ['ja'],
    ru: ['rus'],
    rus: ['ru'],
    ar: ['ara'],
    ara: ['ar'],
};

const REGION_EQUIVALENCES: Record<string, string[]> = {
    can: ['ca'],
    ca: ['can'],
    usa: ['us'],
    us: ['usa'],
    gbr: ['gb', 'uk'],
    gb: ['gbr', 'uk'],
    uk: ['gb', 'gbr'],
};

export class LocalizationCache {
    private state: LocalizationCacheState = {
        supportedLanguages: [],
        supportedSlugs: [],
        isDirty: true,
        lastRefreshedAt: null,
    };

    /**
     * Checks if the localization cache is currently dirty.
     */
    isDirty(): boolean {
        return this.state.isDirty;
    }

    /**
     * Marks the localization cache as dirty so subsequent reads refresh from DB.
     */
    dirty(): void {
        this.state.isDirty = true;
        logger.log('Localization cache dirtied');
    }

    /**
     * Invalidate cache (alias for dirty).
     */
    invalidate(): void {
        this.dirty();
    }

    /**
     * Directly sets cached supported languages (primarily for testing).
     */
    setSupportedLanguages(languages: string[]): void {
        this.state.supportedLanguages = Array.from(new Set(languages));
        this.state.isDirty = false;
        this.state.lastRefreshedAt = new Date();
    }

    /**
     * Directly sets cached supported slugs (primarily for testing).
     */
    setSupportedSlugs(slugs: string[]): void {
        this.state.supportedSlugs = Array.from(new Set(slugs));
        this.state.isDirty = false;
        this.state.lastRefreshedAt = new Date();
    }

    /**
     * Resets the in-memory cache to its initial unpopulated dirty state.
     */
    reset(): void {
        this.state.supportedLanguages = [];
        this.state.supportedSlugs = [];
        this.state.isDirty = true;
        this.state.lastRefreshedAt = null;
    }

    /**
     * Returns a snapshot of internal state.
     */
    getState(): LocalizationCacheState {
        return {
            ...this.state,
            supportedLanguages: [...this.state.supportedLanguages],
            supportedSlugs: [...this.state.supportedSlugs],
        };
    }

    /**
     * Refreshes supported languages and slugs in memory from the database.
     */
    async refresh(): Promise<{
        languages: string[];
        slugs: string[];
    }> {
        try {
            const rows = await db
                .select({
                    slug: localizations.slug,
                    lang: localizations.lang,
                })
                .from(localizations)
                .orderBy(asc(localizations.slug), asc(localizations.lang));

            const languages = Array.from(new Set(rows.map((r) => r.lang)));
            const slugs = Array.from(new Set(rows.map((r) => r.slug)));

            this.state.supportedLanguages = languages;
            this.state.supportedSlugs = slugs;
            this.state.isDirty = false;
            this.state.lastRefreshedAt = new Date();

            return { languages, slugs };
        } catch (err) {
            logger.error('Failed to refresh localization cache:', err);
            return {
                languages: this.state.supportedLanguages,
                slugs: this.state.supportedSlugs,
            };
        }
    }

    /**
     * Returns the current cached list of supported language codes, refreshing if dirty.
     */
    async getSupportedLanguages(): Promise<string[]> {
        if (this.state.isDirty || this.state.supportedLanguages.length === 0) {
            await this.refresh();
        }
        return [...this.state.supportedLanguages];
    }

    /**
     * Returns the current cached list of supported slugnames, refreshing if dirty.
     */
    async getSupportedSlugs(): Promise<string[]> {
        if (this.state.isDirty || this.state.supportedSlugs.length === 0) {
            await this.refresh();
        }
        return [...this.state.supportedSlugs];
    }

    /**
     * Dynamically resolves candidate language codes for a given input against
     * an optional list of available language codes (or current cache state).
     */
    getCandidates(
        langInput?: string,
        availableLanguages: string[] = this.state.supportedLanguages,
    ): string[] {
        const candidates = new Set<string>();

        if (!langInput || typeof langInput !== 'string') {
            candidates.add('eng');
            candidates.add('en');
            for (const lang of availableLanguages) {
                const l = lang.toLowerCase();
                if (l.startsWith('en') || l === 'eng') {
                    candidates.add(lang);
                }
            }
            for (const lang of availableLanguages) {
                candidates.add(lang);
            }
            return Array.from(candidates);
        }

        const raw = langInput.trim();
        if (!raw) {
            candidates.add('eng');
            candidates.add('en');
            for (const lang of availableLanguages) {
                candidates.add(lang);
            }
            return Array.from(candidates);
        }

        const clean = raw.replace(/\.[^.]+$/, '').trim();
        const lower = clean.toLowerCase();
        const normalized = lower.replace(/-/g, '_');
        const hyphenated = lower.replace(/_/g, '-');

        // 1. Direct forms of the requested code
        candidates.add(raw);
        candidates.add(clean);
        candidates.add(lower);
        candidates.add(normalized);
        candidates.add(hyphenated);
        candidates.add(clean.toUpperCase());

        const parts = lower.split(/[-_]/);
        if (parts.length === 2) {
            const [p1, p2] = parts;
            candidates.add(`${p1}-${p2.toUpperCase()}`);
            candidates.add(`${p1}_${p2.toUpperCase()}`);
            candidates.add(`${p1}-${p2.toLowerCase()}`);
            candidates.add(`${p1}_${p2.toLowerCase()}`);
            candidates.add(`${p2}_${p1.toUpperCase()}`);
            candidates.add(`${p2}-${p1.toUpperCase()}`);
            candidates.add(`${p2}_${p1.toLowerCase()}`);
            candidates.add(`${p2}-${p1.toLowerCase()}`);
            candidates.add(p1);
            candidates.add(p2);

            // ISO equivalence for base
            const eq1 = ISO_639_EQUIVALENCES[p1];
            if (eq1) {
                for (const eq of eq1) {
                    candidates.add(eq);
                    candidates.add(`${eq}_${p2}`);
                    candidates.add(`${eq}-${p2}`);
                    candidates.add(`${eq}_${p2.toUpperCase()}`);
                    candidates.add(`${eq}-${p2.toUpperCase()}`);
                    candidates.add(`${p2}_${eq}`);
                    candidates.add(`${p2}-${eq}`);
                }
            }
            const eq2 = ISO_639_EQUIVALENCES[p2];
            if (eq2) {
                for (const eq of eq2) {
                    candidates.add(eq);
                    candidates.add(`${p1}_${eq}`);
                    candidates.add(`${p1}-${eq}`);
                    candidates.add(`${eq}_${p1}`);
                    candidates.add(`${eq}-${p1}`);
                }
            }

            // Region equivalence for dialect tags (e.g. can_fr -> fr-CA)
            const reg1 = REGION_EQUIVALENCES[p1];
            if (reg1) {
                for (const reg of reg1) {
                    candidates.add(`${reg}_${p2}`);
                    candidates.add(`${reg}-${p2}`);
                    candidates.add(`${p2}_${reg}`);
                    candidates.add(`${p2}-${reg}`);
                    candidates.add(`${p2}-${reg.toUpperCase()}`);
                    candidates.add(`${p2}_${reg.toUpperCase()}`);
                    candidates.add(`${reg}-${p2.toUpperCase()}`);
                    candidates.add(`${reg}_${p2.toUpperCase()}`);
                }
            }
            const reg2 = REGION_EQUIVALENCES[p2];
            if (reg2) {
                for (const reg of reg2) {
                    candidates.add(`${p1}_${reg}`);
                    candidates.add(`${p1}-${reg}`);
                    candidates.add(`${p1}-${reg.toUpperCase()}`);
                    candidates.add(`${p1}_${reg.toUpperCase()}`);
                    candidates.add(`${reg}_${p1}`);
                    candidates.add(`${reg}-${p1}`);
                    candidates.add(`${reg}-${p1.toUpperCase()}`);
                    candidates.add(`${reg}_${p1.toUpperCase()}`);
                }
            }
        } else if (parts.length === 1) {
            const base = parts[0];
            const equivalents = ISO_639_EQUIVALENCES[base];
            if (equivalents) {
                for (const eq of equivalents) {
                    candidates.add(eq);
                }
            }
        }

        // 2. Prioritize matches from available languages in memory
        for (const avail of availableLanguages) {
            const availLower = avail.toLowerCase();
            const availNorm = availLower.replace(/-/g, '_');
            if (
                availLower === lower ||
                availNorm === normalized ||
                availLower.replace(/_/g, '-') === hyphenated
            ) {
                candidates.add(avail);
            }
        }

        // Token-based matching against available languages
        if (parts.length === 2) {
            const [p1, p2] = parts;
            for (const avail of availableLanguages) {
                const availLower = avail.toLowerCase();
                if (availLower.includes(p1) && availLower.includes(p2)) {
                    candidates.add(avail);
                }
            }
        }

        // Base language prefix matching against available languages
        const baseCode = parts[0];
        for (const avail of availableLanguages) {
            const availLower = avail.toLowerCase();
            if (
                availLower === baseCode ||
                availLower.startsWith(`${baseCode}_`) ||
                availLower.startsWith(`${baseCode}-`) ||
                (ISO_639_EQUIVALENCES[baseCode] &&
                    ISO_639_EQUIVALENCES[baseCode].some(
                        (eq) =>
                            availLower === eq ||
                            availLower.startsWith(`${eq}_`) ||
                            availLower.startsWith(`${eq}-`),
                    ))
        ) {
            candidates.add(avail);
        }
    }

        // Language family fallback
        if (lower.startsWith('en') || lower.includes('eng')) {
            candidates.add('eng');
            candidates.add('en');
            candidates.add('en-US');
            candidates.add('en_US');
        } else if (
            lower.startsWith('fr') ||
            lower.includes('fre') ||
            lower.includes('fra')
        ) {
            candidates.add('fr');
            candidates.add('fra');
            candidates.add('fre');
            candidates.add('fr-CA');
            candidates.add('fr_CA');
        }

        return Array.from(candidates);
    }
}

/**
 * Singleton instance of LocalizationCache.
 */
export const localizationCache = new LocalizationCache();

/* ------------------------------------------------------------------ */
/* Convenience Functional Exports                                     */
/* ------------------------------------------------------------------ */

export function isCacheDirty(): boolean {
    return localizationCache.isDirty();
}

export function dirtyCache(): void {
    localizationCache.dirty();
}

export function invalidateCache(): void {
    localizationCache.invalidate();
}

export function setCachedSupportedLanguages(languages: string[]): void {
    localizationCache.setSupportedLanguages(languages);
}

export function setCachedSupportedSlugs(slugs: string[]): void {
    localizationCache.setSupportedSlugs(slugs);
}

export function resetLocalizationCache(): void {
    localizationCache.reset();
}

export async function refreshCache(): Promise<{
    languages: string[];
    slugs: string[];
}> {
    return localizationCache.refresh();
}

export async function getSupportedLanguages(): Promise<string[]> {
    return localizationCache.getSupportedLanguages();
}

export async function getSupportedSlugs(): Promise<string[]> {
    return localizationCache.getSupportedSlugs();
}

export function getLanguageCandidates(
    langInput?: string,
    availableLanguages?: string[],
): string[] {
    return localizationCache.getCandidates(langInput, availableLanguages);
}

export const __test__ = {
    state: localizationCache.getState(),
    resetLocalizationCache,
    localizationCache,
};
