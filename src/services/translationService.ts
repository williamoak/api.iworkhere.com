/**
 * @myDocBlock v2.3
 * @file translationService.ts
 * @external
 * @module services/translationService
 * @tag translation, deepl, localization
 * @version 1.1.0
 * @author william.r.oak@gmail.com
 * @summary DeepL translation service for text translation.
 * @description
 * Translates text into target languages using the DeepL API with automatic
 * endpoint detection (Free vs Pro) and language code mapping.
 *
 * @requires
 * {
 *   "services": [
 *     "logger"
 *   ]
 * }
 */

import {logger} from '@helpers/logger';

/**
 * Target language definitions grouped by DeepL target language code.
 */
const DEEPL_LANGUAGE_GROUPS = {
    FR: ['can_fr', 'ca_fr', 'fr_ca', 'fr_can', 'fra_ca', 'fre_ca', 'fr', 'fra', 'fre', 'fr_fr', 'fr-fr', 'fr-ca', 'french'],
    ES: ['es', 'spa', 'spanish', 'es_es', 'es_mx', 'es-es', 'es-mx'],
    DE: ['de', 'ger', 'deu', 'german', 'de_de', 'de-de'],
    IT: ['it', 'ita', 'italian', 'it_it', 'it-it'],
    JA: ['ja', 'jpn', 'japanese'],
    'PT-PT': ['pt', 'por', 'portuguese', 'pt_pt', 'pt-pt'],
    'PT-BR': ['pt_br', 'pt-br'],
    RU: ['ru', 'rus', 'russian'],
    ZH: ['zh', 'zho', 'chi', 'chinese'],
    NL: ['nl', 'nld', 'dut', 'dutch'],
    PL: ['pl', 'pol', 'polish'],
} as const;

/**
 * Maps common language codes/dialects to standard DeepL target language codes.
 */
export const DEEPL_TARGET_LANG_MAP: Record<string, string> = Object.fromEntries(
    Object.entries(DEEPL_LANGUAGE_GROUPS).flatMap(([target, aliases]) =>
        aliases.map((alias) => [alias, target])
    )
);

/**
 * Language name definitions grouped by English display name.
 */
const LANGUAGE_NAME_GROUPS = {
    English: ['en', 'eng', 'english', 'en_ca', 'en_us', 'en_gb', 'can_en', 'us_en'],
    French: ['fr', 'fra', 'fre', 'french', 'can_fr', 'ca_fr', 'fr_ca', 'fr_can', 'fra_ca', 'fre_ca', 'fr_fr', 'fr-fr', 'fr-ca'],
    Spanish: ['es', 'spa', 'spanish', 'es_es', 'es_mx', 'es-es', 'es-mx'],
    German: ['de', 'ger', 'deu', 'german', 'de_de', 'de-de'],
    Italian: ['it', 'ita', 'italian', 'it_it', 'it-it'],
    Japanese: ['ja', 'jpn', 'japanese'],
    Chinese: ['zh', 'chi', 'zho', 'chinese'],
    Portuguese: ['pt', 'por', 'portuguese', 'pt_pt', 'pt-pt', 'pt_br', 'pt-br'],
    Russian: ['ru', 'rus', 'russian'],
    Dutch: ['nl', 'nld', 'dut', 'dutch'],
    Polish: ['pl', 'pol', 'polish'],
} as const;

/**
 * Maps language codes, aliases, and dialect identifiers to human-readable language names.
 */
export const LANGUAGE_NAME_MAP: Record<string, string> = Object.fromEntries(
    Object.entries(LANGUAGE_NAME_GROUPS).flatMap(([name, aliases]) =>
        aliases.map((alias) => [alias, name])
    )
);

/**
 * Normalizes an arbitrary language tag into a DeepL target language code.
 */
export function mapToDeepLTargetLang(lang: string): string {
    if (!lang) return 'EN';
    const lower = lang.toLowerCase().trim();
    const base = lower.split(/[_-]/)[0];
    return DEEPL_TARGET_LANG_MAP[lower] || DEEPL_TARGET_LANG_MAP[base] || base.toUpperCase();
}

/**
 * Resolves human-readable language name for a given language code.
 */
export function getLanguageName(lang: string): string {
    if (!lang) return 'English';
    const lower = lang.toLowerCase().trim();

    // 1. Exact match / dialect lookup
    if (LANGUAGE_NAME_MAP[lower]) {
        return LANGUAGE_NAME_MAP[lower];
    }

    // 2. Segment match (e.g., 'fr-CA' -> 'fr', 'ca_fr' -> 'fr')
    const segments = lower.split(/[_-]/);
    for (const segment of segments) {
        if (LANGUAGE_NAME_MAP[segment]) {
            return LANGUAGE_NAME_MAP[segment];
        }
    }

    // 3. Two-letter ISO prefix match (e.g., 'es-419' -> 'es')
    const prefix = lower.slice(0, 2);
    if (LANGUAGE_NAME_MAP[prefix]) {
        return LANGUAGE_NAME_MAP[prefix];
    }

    return lang.toUpperCase();
}

export interface DeepLTranslateOptions {
    apiKey?: string;
    apiUrl?: string;
    formality?: 'default' | 'more' | 'less' | 'prefer_more' | 'prefer_less';
}

/**
 * Translates text into target language using DeepL API.
 * Returns translated string or null if translation could not be performed.
 */
export async function translateWithDeepL(
    text: string,
    targetLanguage: string,
    options: DeepLTranslateOptions = {}
): Promise<string | null> {
    if (!text || !text.trim()) {
        return text;
    }

    const apiKey =
        options.apiKey ||
        process.env.DEEPL_API_KEY ||
        process.env.DEEPL_KEY ||
        process.env.DEEPL_AUTH_KEY;

    if (!apiKey) {
        logger.warn('[DeepL] No API key found in environment (DEEPL_API_KEY). Skipping translation.');
        return null;
    }

    const targetLang = mapToDeepLTargetLang(targetLanguage);
    const isFreeKey = apiKey.endsWith(':fx');
    const endpoint = options.apiUrl || (isFreeKey ? 'https://api-free.deepl.com/v2/translate' : 'https://api.deepl.com/v2/translate');

    try {
        const body: Record<string, unknown> = {
            text: [text],
            target_lang: targetLang,
            ...(options.formality ? {formality: options.formality} : {}),
        };

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                Authorization: `DeepL-Auth-Key ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            logger.warn(`[DeepL] API error (${response.status} ${response.statusText}): ${errText}`);
            return null;
        }

        const data = (await response.json()) as {
            translations?: Array<{
                detected_source_language?: string;
                text?: string;
            }>;
        };

        const translated = data?.translations?.[0]?.text;
        return typeof translated === 'string' && translated.length > 0 ? translated : null;
    } catch (err) {
        logger.warn('[DeepL] Translation request failed:', err);
        return null;
    }
}
