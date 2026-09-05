/**
 * @myDocBlock v2.3
 * @file GET.ts
 * @external
 * @module routes/v1/localization
 * @tag localization
 * @version 1.1.1
 * @author william.r.oak@gmail.com
 * @path /v1/localization
 * @summary Fetch localization records or resolve localized text.
 *
 * @description
 * Deterministic, identifier-based retrieval and dynamic language fallback resolution
 * of localization strings with in-memory caching of supported languages and slugnames.
 *
 * Resolution order:
 *   1) id — fetch exact record by UUID
 *   2) slug + lang — resolve localized text with dynamic language candidate fallback
 *   3) slug only — return slug with comma-delimited list of supported language codes
 *   4) lang only — return language code with comma-delimited list of supported slugnames
 *   5) no query params — returns 400 error (must provide either slug or lang as a minimum)
 *
 * @query
 * {
 *   "id": {
 *     "type": "string",
 *     "required": false,
 *     "description": "Exact UUID of the localization record"
 *   },
 *   "slug": {
 *     "type": "string",
 *     "required": false,
 *     "description": "Localization slug identifier"
 *   },
 *   "lang": {
 *     "type": "string",
 *     "required": false,
 *     "description": "Language code or tag (e.g. en_ca, can_fr, en_us, eng, fr)"
 *   }
 * }
 *
 * @response
 * {
 *   "id": "uuid",
 *   "slug": "username",
 *   "lang": "eng",
 *   "requestedLang": "en_ca",
 *   "languageName": "English",
 *   "text": "Enter your username",
 *   "value": "Enter your username",
 *   "codepage": "UTF-8",
 *   "direction": "ltr",
 *   "description": "Prompt asking user to enter their username",
 *   "createdAt": "ISO-8601",
 *   "updatedAt": "ISO-8601"
 * }
 *
 * @requires
 * {
 *   "tables": ["localizations"],
 *   "services": ["dbService"]
 * }
 */

import type { Request, Response } from 'express';
import { asc, eq } from 'drizzle-orm';

import { db } from '@services/dbService';
import { localizations, type Localization } from '@db/schema/localizations';
import { cacheStore } from '@cache/cacheStore';
import { logger } from '@helpers/logger';
import {
    getLanguageCandidates,
    getSupportedLanguages,
    getSupportedSlugs,
    dirtyCache,
    invalidateCache,
    refreshCache,
} from '@cache/localizationCache';
import {
    resolveCanonicalSlug,
    resolveAndTranslateLocalization,
} from '@services/localizationResolverService';

export {
    getLanguageCandidates,
    getSupportedLanguages,
    getSupportedSlugs,
    dirtyCache,
    invalidateCache,
    refreshCache,
};

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function normalize(param: unknown): string | undefined {
    if (typeof param !== 'string') return undefined;
    const trimmed = param.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

export function cleanLanguageCode(raw: unknown): string | undefined {
    if (typeof raw !== 'string') return undefined;
    let trimmed = raw.trim();
    if (!trimmed || trimmed === '*') return undefined;

    // 1. Handle comma-separated list e.g. Accept-Language: "fr-CA,fr;q=0.9,en-US;q=0.8"
    if (trimmed.includes(',')) {
        trimmed = trimmed.split(',')[0].trim();
    }

    // 2. Handle quality / parameter values e.g. "fr-CA;q=0.9"
    if (trimmed.includes(';')) {
        trimmed = trimmed.split(';')[0].trim();
    }

    // 3. Handle key-value formats like "X-lang=en_ca", "lang=en_ca", "Language-Hint: can_fr"
    if (trimmed.includes('=')) {
        const parts = trimmed.split('=');
        trimmed = parts[parts.length - 1].trim();
    } else if (trimmed.includes(':')) {
        const parts = trimmed.split(':');
        trimmed = parts[parts.length - 1].trim();
    }

    // 4. Strip quotes if any
    trimmed = trimmed.replace(/^["']|["']$/g, '').trim();

    return trimmed.length > 0 && trimmed !== '*' ? trimmed : undefined;
}

export function extractLanguage(req: Request): string | undefined {
    if (!req) return undefined;

    // 1. Query parameters
    const queryKeys = [
        'lang',
        'locale',
        'language',
        'language_hint',
        'language-hint',
        'lang_hint',
        'lang-hint',
        'x-lang',
        'x-language',
        'x-locale',
        'x-language-hint',
        'x-lang-hint',
        'X-lang',
        'X-Lang',
        'X-Language',
        'X-Locale',
        'X-Language-Hint',
        'Language-Hint',
        'Language_Hint',
        'Lang-Hint',
        'Lang_Hint',
    ];
    if (req.query) {
        for (const key of queryKeys) {
            const val = cleanLanguageCode(req.query[key]);
            if (val) return val;
        }
    }

    // 2. Custom and standard HTTP headers
    const headerKeys = [
        'x-language-hint',
        'language-hint',
        'x-lang-hint',
        'lang-hint',
        'x-lang',
        'x-language',
        'x-locale',
        'language',
        'lang',
        'locale',
        'content-language',
        'accept-language',
    ];
    for (const key of headerKeys) {
        const headerVal =
            req.headers?.[key] ||
            (typeof req.get === 'function' ? req.get(key) : undefined);
        const cleaned = cleanLanguageCode(headerVal);
        if (cleaned) return cleaned;
    }

    // Check header keys for cases where client sent header like "X-lang=en_ca" or "Language-Hint=can_fr"
    if (req.headers) {
        for (const [key] of Object.entries(req.headers)) {
            const lowerKey = key.toLowerCase();
            if (
                lowerKey.startsWith('x-lang') ||
                lowerKey.startsWith('x-language') ||
                lowerKey.startsWith('x-locale') ||
                lowerKey.startsWith('language-hint') ||
                lowerKey.startsWith('lang-hint') ||
                lowerKey.startsWith('language=') ||
                lowerKey.startsWith('lang=') ||
                lowerKey.startsWith('locale=')
            ) {
                const parsed = cleanLanguageCode(key);
                if (parsed) return parsed;
            }
        }
    }

    // 3. Cookies
    const cookieKeys = [
        'lang',
        'locale',
        'language',
        'language_hint',
        'lang_hint',
        'x-lang',
    ];
    if (req.cookies) {
        for (const key of cookieKeys) {
            const val = cleanLanguageCode(req.cookies[key]);
            if (val) return val;
        }
    }

    return undefined;
}

/* ------------------------------------------------------------------ */
/* Repository                                                         */
/* ------------------------------------------------------------------ */

export interface LocalizationRecord {
    id: string;
    slug: string;
    lang: string;
    languageName?: string | null;
    text: string;
    value?: string;
    codepage?: string | null;
    direction?: string | null;
    description?: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface LocalizationRepository {
    getById(id: string): Promise<LocalizationRecord | null>;
    findBySlug(slug: string): Promise<LocalizationRecord[]>;
    findBySlugAndLang(
        slug: string,
        lang: string,
    ): Promise<LocalizationRecord | null>;
    findByLang(lang: string): Promise<LocalizationRecord[]>;
    getAll(): Promise<LocalizationRecord[]>;
}

function mapRow(row: Localization): LocalizationRecord {
    return {
        id: row.id,
        slug: row.slug,
        lang: row.lang,
        languageName: row.languageName,
        text: row.text,
        value: row.text,
        codepage: row.codepage,
        direction: row.direction,
        description: row.description,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

export const dbLocalizationRepository: LocalizationRepository = {
    async getById(id: string) {
        const rows = await db
            .select()
            .from(localizations)
            .where(eq(localizations.id, id))
            .limit(1);

        return rows.length === 1 ? mapRow(rows[0]) : null;
    },

    async findBySlug(slug: string) {
        const canonicalSlug = resolveCanonicalSlug(slug);
        const slugsToCheck = Array.from(new Set([slug, canonicalSlug]));

        for (const s of slugsToCheck) {
            const rows = await db
                .select()
                .from(localizations)
                .where(eq(localizations.slug, s))
                .orderBy(asc(localizations.lang));

            if (rows.length > 0) {
                return rows.map(mapRow);
            }
        }

        return [];
    },

    async findBySlugAndLang(slug: string, lang: string) {
        const canonicalSlug = resolveCanonicalSlug(slug);
        const slugsToCheck = Array.from(new Set([slug, canonicalSlug]));

        let allRows: Localization[] = [];
        for (const s of slugsToCheck) {
            const rows = await db
                .select()
                .from(localizations)
                .where(eq(localizations.slug, s));
            if (rows.length > 0) {
                allRows = rows;
                break;
            }
        }

        if (allRows.length > 0) {
            const availableLanguages = allRows.map((r) => r.lang);
            const candidates = getLanguageCandidates(lang, availableLanguages);

            for (const candidate of candidates) {
                const found = allRows.find(
                    (r) =>
                        r.lang === candidate ||
                        r.lang.toLowerCase() === candidate.toLowerCase() ||
                        r.lang.toLowerCase().replace(/-/g, '_') ===
                            candidate.toLowerCase().replace(/-/g, '_'),
                );
                if (found) return mapRow(found);
            }
        }

        // Dynamically resolve and translate if not found in DB
        const dynamicRecord = await resolveAndTranslateLocalization({
            slug,
            lang,
        });
        if (dynamicRecord) {
            return dynamicRecord;
        }

        if (allRows.length > 0) {
            const enFallback = allRows.find(
                (r) =>
                    r.lang.toLowerCase().startsWith('en') ||
                    r.lang.toLowerCase() === 'eng',
            );
            return enFallback ? mapRow(enFallback) : null;
        }

        return null;
    },

    async findByLang(lang: string) {
        const supported = await getSupportedLanguages();
        const candidates = getLanguageCandidates(lang, supported);
        const allRows = await db
            .select()
            .from(localizations)
            .orderBy(asc(localizations.slug), asc(localizations.lang));

        const matched = allRows.filter((r) =>
            candidates.some(
                (c) =>
                    r.lang === c ||
                    r.lang.toLowerCase() === c.toLowerCase() ||
                    r.lang.toLowerCase().replace(/-/g, '_') ===
                        c.toLowerCase().replace(/-/g, '_'),
            ),
        );

        return matched.map(mapRow);
    },

    async getAll() {
        const rows = await db
            .select()
            .from(localizations)
            .orderBy(asc(localizations.slug), asc(localizations.lang));

        return rows.map(mapRow);
    },
};

/* ------------------------------------------------------------------ */
/* HTTP handler factory                                               */
/* ------------------------------------------------------------------ */

export function makeGetLocalizationHandler(repo: LocalizationRepository) {
    return async function GET(req: Request, res: Response) {
        try {
            const id = normalize(req.query?.id);
            const slugRaw = req.query?.slug;
            const slugs = Array.isArray(slugRaw)
                ? slugRaw.map((s) => String(s).trim()).filter(Boolean)
                : typeof slugRaw === 'string' && slugRaw.includes(',')
                ? slugRaw.split(',').map((s) => s.trim()).filter(Boolean)
                : normalize(slugRaw)
                ? [normalize(slugRaw)!]
                : [];
            const lang = extractLanguage(req);

            // 1. Guard rails
            if (id && (slugs.length > 0 || lang)) {
                return res.status(400).json({
                    error: 'INVALID_REQUEST',
                    message: 'id cannot be combined with slug or lang',
                });
            }

            // Must provide either slug or lang as a minimum (if no id)
            if (!id && slugs.length === 0 && !lang) {
                return res.status(400).json({
                    error: 'INVALID_REQUEST',
                    message: 'Must provide either slug or lang as a minimum',
                });
            }

            // 2. Fetch by ID
            if (id) {
                const record = await repo.getById(id);
                if (!record) {
                    return res.status(404).json({
                        error: 'NOT_FOUND',
                        message: 'Localization record not found',
                    });
                }
                return res.status(200).json(record);
            }

            // 3. Both slug AND lang provided -> resolve specific translation(s)
            if (slugs.length > 0 && lang) {
                const fallbackQuery = normalize(req.query?.fallback);

                const results = await Promise.all(
                    slugs.map(async (s) => {
                        const cacheKey = `localization:${s}:${lang}`;
                        let record = await cacheStore.get<LocalizationRecord>(
                            cacheKey,
                        );

                        if (!record) {
                            record = await repo.findBySlugAndLang(s, lang);
                            if (!record && fallbackQuery && slugs.length === 1) {
                                record = await resolveAndTranslateLocalization({
                                    slug: s,
                                    lang,
                                    fallbackText: fallbackQuery,
                                });
                            }
                            if (record) {
                                await cacheStore.set(cacheKey, record, 86400000);
                            }
                        }
                        return record ? { ...record, requestedLang: lang } : null;
                    }),
                );

                const validResults = results.filter(
                    (r): r is LocalizationRecord & { requestedLang: string } =>
                        r !== null,
                );

                if (slugs.length === 1) {
                    if (validResults.length === 0) {
                        return res.status(404).json({
                            error: 'NOT_FOUND',
                            message: `Localization not found for slug '${slugs[0]}'`,
                        });
                    }
                    return res.status(200).json(validResults[0]);
                }

                return res.status(200).json({
                    records: validResults,
                    count: validResults.length,
                });
            }

            // 4. Slug only -> return slug with comma-delimited list of supported language codes
            if (slugs.length > 0) {
                const slug = slugs[0]; // Take first slug for this legacy behavior
                const records = await repo.findBySlug(slug);
                if (!records || records.length === 0) {
                    return res.status(404).json({
                        error: 'NOT_FOUND',
                        message: `Localization not found for slug '${slug}'`,
                    });
                }

                const languages = Array.from(
                    new Set(records.map((r) => r.lang)),
                ).join(',');

                return res.status(200).json({
                    slug,
                    languages,
                    langs: languages,
                });
            }

            // 5. Lang only -> return language code with full records
            if (lang) {
                const records = await repo.findByLang(lang);
                if (!records || records.length === 0) {
                    return res.status(404).json({
                        error: 'NOT_FOUND',
                        message: `No localizations found for language '${lang}'`,
                    });
                }

                const slugs = Array.from(
                    new Set(records.map((r) => r.slug)),
                ).join(',');

                return res.status(200).json({
                    lang,
                    slugs,
                    slugnames: slugs,
                    records,
                    count: records.length,
                });
            }
        } catch (err) {
            logger.error('GET /v1/localization error:', err);
            return res.status(500).json({
                error: 'INTERNAL_ERROR',
                message: 'Failed to retrieve localization',
            });
        }
    };
}

const GET = makeGetLocalizationHandler(dbLocalizationRepository);
export default GET;

export const __test__ = {
    dbLocalizationRepository,
    makeGetLocalizationHandler,
    getLanguageCandidates,
    extractLanguage,
    cleanLanguageCode,
};
