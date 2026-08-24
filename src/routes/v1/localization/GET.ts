/**
 * @myDocBlock v2.3
 * @file GET.ts
 * @external
 * @module routes/v1/localization
 * @tag localization
 * @version 1.1.0
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
import { logger } from '@helpers/logger';
import {
    getLanguageCandidates,
    getSupportedLanguages,
    getSupportedSlugs,
    dirtyCache,
    invalidateCache,
    refreshCache,
} from '@cache/localizationCache';

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
        const rows = await db
            .select()
            .from(localizations)
            .where(eq(localizations.slug, slug))
            .orderBy(asc(localizations.lang));

        return rows.map(mapRow);
    },

    async findBySlugAndLang(slug: string, lang: string) {
        const rows = await db
            .select()
            .from(localizations)
            .where(eq(localizations.slug, slug));

        if (rows.length === 0) return null;

        const availableLanguages = rows.map((r) => r.lang);
        const candidates = getLanguageCandidates(lang, availableLanguages);

        for (const candidate of candidates) {
            const found = rows.find(
                (r) =>
                    r.lang === candidate ||
                    r.lang.toLowerCase() === candidate.toLowerCase() ||
                    r.lang.toLowerCase().replace(/-/g, '_') ===
                        candidate.toLowerCase().replace(/-/g, '_'),
            );
            if (found) return mapRow(found);
        }

        const enFallback = rows.find(
            (r) =>
                r.lang.toLowerCase().startsWith('en') ||
                r.lang.toLowerCase() === 'eng',
        );
        return enFallback ? mapRow(enFallback) : mapRow(rows[0]);
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
            const id = normalize(req.query.id);
            const slug = normalize(req.query.slug);
            const lang = normalize(req.query.lang);

            // 1. Guard rails
            if (id && (slug || lang)) {
                return res.status(400).json({
                    error: 'INVALID_REQUEST',
                    message: 'id cannot be combined with slug or lang',
                });
            }

            // Must provide either slug or lang as a minimum (if no id)
            if (!id && !slug && !lang) {
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

            // 3. Both slug AND lang provided -> resolve specific translation
            if (slug && lang) {
                const record = await repo.findBySlugAndLang(slug, lang);
                if (!record) {
                    return res.status(404).json({
                        error: 'NOT_FOUND',
                        message: `Localization not found for slug '${slug}'`,
                    });
                }

                return res.status(200).json({
                    ...record,
                    requestedLang: lang,
                });
            }

            // 4. Slug only -> return slug with comma-delimited list of supported language codes
            if (slug) {
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

            // 5. Lang only -> return language code with comma-delimited list of supported slugnames
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
};
