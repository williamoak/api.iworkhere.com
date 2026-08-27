/**
 * @myDocBlock v2.3
 * @file GET.ts
 * @external
 * @module routes/v1/auth/eula
 * @tag auth, eula, localization, deepl
 * @version 1.1.0
 * @author william.r.oak@gmail.com
 * @path /v1/auth/eula
 * @summary Fetch the current End User License Agreement (EULA) with dynamic localization support.
 * @description
 * Returns the latest EULA document with multi-language resolution:
 * 1) If the current language is English, fetches the EULA text from the config table (name = "eula").
 * 2) If the selected language is not English, checks the localization table for slug = "eula" and lang = currently_selected_language.
 * 3) If there is a valid localized EULA, returns that.
 * 4) If not cached, translates the base English EULA via DeepL, saves the translated record in the localizations table, and returns it.
 *
 * @query
 * {
 *   "lang": {
 *     "type": "string",
 *     "required": false,
 *     "description": "Optional language code (e.g. en_ca, can_fr, fr, es)"
 *   }
 * }
 *
 * @requestExample
 * {}
 *
 * @response
 * 200:
 * {
 *   "name": "eula",
 *   "version": "1.00",
 *   "value": "<p>EULA Content</p>",
 *   "lineCount": 10,
 *   "updatedAt": "ISO-8601"
 * }
 * 404:
 * {
 *   "error": "EULA not found"
 * }
 *
 * @requires
 * {
 *   "tables": [
 *     "config",
 *     "localizations"
 *   ],
 *   "services": [
 *     "dbService",
 *     "translationService"
 *   ]
 * }
 */

import type { Request, Response } from 'express';
import { desc, eq } from 'drizzle-orm';
import { db } from '@services/dbService';
import { configTable } from '@db/schema/config';
import { localizations, type Localization } from '@db/schema/localizations';
import { markdownToHtml } from '@helpers/markdownToHtml';
import { logger } from '@helpers/logger';
import { extractLanguage } from '@routes/v1/localization/GET';
import { getLanguageCandidates, dirtyCache } from '@cache/localizationCache';
import { translateWithDeepL, getLanguageName } from '@services/translationService';

const EULA_CONFIG_NAME = 'eula';

export type EulaRecord = {
    name: 'eula';
    version: string;
    value: unknown;
    updatedAt: Date;
};

export interface EulaRepository {
    getLatest(): Promise<EulaRecord | null>;
}

export interface LocalizationEulaRepository {
    findBySlugAndLang(slug: string, lang: string): Promise<Localization | null>;
    save(record: {
        slug: string;
        lang: string;
        languageName?: string | null;
        text: string;
        codepage?: string | null;
        direction?: string | null;
        description?: string | null;
    }): Promise<Localization>;
}

export type TranslatorFunction = (
    text: string,
    targetLang: string
) => Promise<string | null>;

/**
 * Determines whether a language code corresponds to an English variant.
 */
export function isEnglishLanguage(lang?: string): boolean {
    if (!lang) return true;
    const lower = lang.toLowerCase().trim();
    return (
        lower === 'en' ||
        lower === 'eng' ||
        lower === 'english' ||
        lower.startsWith('en_') ||
        lower.startsWith('en-') ||
        lower.startsWith('eng_') ||
        lower.startsWith('eng-') ||
        lower === 'us_en' ||
        lower === 'gb_en' ||
        lower === 'ca_en' ||
        lower === 'can_en'
    );
}

/**
 * If the stored value is:
 * - jsonb object: return as-is
 * - string containing JSON: parse it
 * - string but not JSON: return as-is
 */
function normalizeEulaValue(raw: unknown): unknown {
    if (typeof raw !== 'string') return raw;

    const trimmed = raw.trim();
    if (!trimmed) return raw;

    try {
        return JSON.parse(trimmed);
    } catch {
        return raw;
    }
}

const dbEulaRepository: EulaRepository = {
    async getLatest() {
        const rows = await db
            .select({
                name: configTable.name,
                version: configTable.version,
                value: configTable.value,
                updatedAt: configTable.updatedAt,
            })
            .from(configTable)
            .where(eq(configTable.name, EULA_CONFIG_NAME))
            .orderBy(desc(configTable.version))
            .limit(1);

        const row = rows[0];
        if (!row) return null;

        return {
            name: 'eula',
            version: String(row.version),
            value: normalizeEulaValue(row.value),
            updatedAt: row.updatedAt,
        };
    },
};

const dbLocalizationEulaRepository: LocalizationEulaRepository = {
    async findBySlugAndLang(slug: string, lang: string) {
        const candidates = getLanguageCandidates(lang);
        const rows = await db
            .select()
            .from(localizations)
            .where(eq(localizations.slug, slug));

        for (const candidate of candidates) {
            const found = rows.find(
                (r) => r.lang.toLowerCase() === candidate.toLowerCase()
            );
            if (found) return found;
        }
        return null;
    },
    async save(record) {
        const rows = await db
            .insert(localizations)
            .values({
                slug: record.slug,
                lang: record.lang,
                languageName: record.languageName || getLanguageName(record.lang),
                text: record.text,
                codepage: record.codepage || 'UTF-8',
                direction: record.direction || 'ltr',
                description: record.description || 'EULA translated via DeepL',
            })
            .onConflictDoUpdate({
                target: [localizations.slug, localizations.lang],
                set: {
                    text: record.text,
                    languageName: record.languageName || getLanguageName(record.lang),
                    codepage: record.codepage || 'UTF-8',
                    direction: record.direction || 'ltr',
                    description: record.description || 'EULA translated via DeepL',
                    updatedAt: new Date(),
                },
            })
            .returning();

        dirtyCache();
        return rows[0];
    },
};

export async function fetchLatestEula(
    repo: EulaRepository
): Promise<EulaRecord | null> {
    const record = await repo.getLatest();
    if (!record) return null;
    return {
        ...record,
        value: normalizeEulaValue(record.value),
    };
}

/**
 * Handler factory for GET /v1/auth/eula with repository and translator seams for unit tests.
 */
export function makeGetEulaHandler(
    repo: EulaRepository = dbEulaRepository,
    locRepo: LocalizationEulaRepository = dbLocalizationEulaRepository,
    translator: TranslatorFunction = translateWithDeepL
) {
    return async function GET(req: Request, res: Response) {
        const lang = extractLanguage(req) || 'en';
        const isEnglish = isEnglishLanguage(lang);

        if (isEnglish) {
            // 1) If current language is English, fetch from config table as currently setup
            const record = await fetchLatestEula(repo);

            if (!record) {
                return res.status(404).json({
                    error: 'EULA not found',
                });
            }

            const textContent =
                typeof record.value === 'object' && record.value !== null && 'text' in record.value
                    ? String((record.value as any).text)
                    : String(record.value);

            return res.status(200).json({
                name: record.name,
                version: record.version,
                value: markdownToHtml(textContent),
                lineCount: textContent.split('\n').length,
                updatedAt: record.updatedAt.toISOString(),
            });
        }

        // 2) If selected language is not English, check localization table for slug=eula and lang
        const cached = await locRepo.findBySlugAndLang('eula', lang);

        // 3) If there is a valid localized EULA, use that
        if (cached && cached.text) {
            return res.status(200).json({
                name: 'eula',
                version: '1.00',
                value: markdownToHtml(cached.text),
                lineCount: cached.text.split('\n').length,
                updatedAt: cached.updatedAt.toISOString(),
                lang: cached.lang,
                isTranslated: true,
            });
        }

        // 4) Not found in localizations: fetch base English EULA, translate via DeepL, and SAVE
        const baseRecord = await fetchLatestEula(repo);
        if (!baseRecord) {
            return res.status(404).json({
                error: 'EULA not found',
            });
        }

        const baseText =
            typeof baseRecord.value === 'object' && baseRecord.value !== null && 'text' in baseRecord.value
                ? String((baseRecord.value as any).text)
                : String(baseRecord.value);

        try {
            const translatedText = await translator(baseText, lang);
            if (translatedText && translatedText.trim().length > 0) {
                // SAVE the translated EULA with the language it was translated to
                const saved = await locRepo.save({
                    slug: 'eula',
                    lang: lang,
                    languageName: getLanguageName(lang),
                    text: translatedText,
                    codepage: 'UTF-8',
                    direction: 'ltr',
                    description: 'EULA translated via DeepL',
                });

                return res.status(200).json({
                    name: 'eula',
                    version: baseRecord.version,
                    value: markdownToHtml(translatedText),
                    lineCount: translatedText.split('\n').length,
                    updatedAt: saved?.updatedAt ? saved.updatedAt.toISOString() : new Date().toISOString(),
                    lang: lang,
                    isTranslated: true,
                });
            }
        } catch (err) {
            logger.warn(`[EULA] Translation failed for lang '${lang}':`, err);
        }

        // Fallback to base English EULA if translation is unavailable
        return res.status(200).json({
            name: baseRecord.name,
            version: baseRecord.version,
            value: markdownToHtml(baseText),
            lineCount: baseText.split('\n').length,
            updatedAt: baseRecord.updatedAt.toISOString(),
        });
    };
}

const GET = makeGetEulaHandler(dbEulaRepository, dbLocalizationEulaRepository, translateWithDeepL);
export default GET;

export const __test__ = {
    fetchLatestEula,
    makeGetEulaHandler,
    isEnglishLanguage,
    dbEulaRepository,
    dbLocalizationEulaRepository,
};