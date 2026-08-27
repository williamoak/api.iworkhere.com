/**
 * @myDocBlock v2.3
 * @file localizationResolverService.ts
 * @external
 * @module services/localizationResolverService
 * @tag localization, translation, deepl, resolver
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @summary Dynamic localization and base source text resolver with DeepL translation.
 * @description
 * Provides canonical slug aliasing, base English source text resolution from
 * localizations or config tables, and on-demand translation with database persistence
 * and cache invalidation.
 *
 * @requires
 * {
 *   "tables": [
 *     "localizations",
 *     "config"
 *   ],
 *   "services": [
 *     "dbService",
 *     "translationService"
 *   ]
 * }
 */

import { desc, eq } from 'drizzle-orm';
import { db } from '@services/dbService';
import { localizations, type Localization } from '@db/schema/localizations';
import { configTable } from '@db/schema/config';
import { logger } from '@helpers/logger';
import { dirtyCache } from '@cache/localizationCache';
import {
  translateWithDeepL,
  getLanguageName,
} from '@services/translationService';
import { isEnglishLanguage } from '@routes/v1/auth/eula/GET';
import type { LocalizationRecord } from '@routes/v1/localization/GET';

export const SLUG_ALIASES: Record<string, string> = {
  eula_body_text: 'eula',
  eula_text: 'eula',
  eula_content: 'eula',
  eula_body: 'eula',
};

/**
 * Resolves a slug name to its canonical alias if defined.
 */
export function resolveCanonicalSlug(slug: string): string {
  if (!slug || typeof slug !== 'string') return slug;
  const normalized = slug.trim().toLowerCase();
  return SLUG_ALIASES[normalized] || normalized;
}

/**
 * Maps a database localization row into a LocalizationRecord DTO.
 */
export function mapLocalizationRow(row: Localization): LocalizationRecord {
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

/**
 * Fetches base English text for a given slug from:
 * 1. localizations table (slug or canonical alias with English lang)
 * 2. config table (name = canonicalSlug or name = slug)
 * 3. optional fallback text
 */
export async function fetchBaseEnglishText(
  slug: string,
  fallbackText?: string,
): Promise<string | null> {
  if (!slug) return fallbackText || null;
  const canonicalSlug = resolveCanonicalSlug(slug);
  const slugsToCheck = Array.from(new Set([slug.trim(), canonicalSlug]));

  // 1. Check localizations table for English record
  for (const s of slugsToCheck) {
    try {
      const rows = await db
        .select()
        .from(localizations)
        .where(eq(localizations.slug, s));

      const enRow = rows.find((r) => isEnglishLanguage(r.lang));
      if (enRow && enRow.text && enRow.text.trim().length > 0) {
        return enRow.text;
      }
    } catch (err) {
      logger.warn(
        `[LOCALIZATION_RESOLVER] Error querying localizations for English text of '${s}':`,
        err,
      );
    }
  }

  // 2. Check config table for canonicalSlug or slug (e.g. eula)
  for (const s of slugsToCheck) {
    try {
      const configRows = await db
        .select({
          name: configTable.name,
          version: configTable.version,
          value: configTable.value,
        })
        .from(configTable)
        .where(eq(configTable.name, s))
        .orderBy(desc(configTable.version))
        .limit(1);

      if (configRows.length > 0 && configRows[0]?.value) {
        const val = configRows[0].value;
        if (typeof val === 'object' && val !== null && 'text' in val) {
          return String((val as Record<string, unknown>).text);
        }
        if (typeof val === 'string') {
          try {
            const parsed = JSON.parse(val.trim());
            if (
              typeof parsed === 'object' &&
              parsed !== null &&
              'text' in parsed
            ) {
              return String(parsed.text);
            }
          } catch {
            // plain string
          }
          return val;
        }
        return JSON.stringify(val);
      }
    } catch (err) {
      logger.warn(
        `[LOCALIZATION_RESOLVER] Error querying config table for '${s}':`,
        err,
      );
    }
  }

  // 3. Fallback text if provided
  if (fallbackText && fallbackText.trim().length > 0 && fallbackText !== slug) {
    return fallbackText.trim();
  }

  return null;
}

export interface ResolveAndTranslateOptions {
  slug: string;
  lang: string;
  fallbackText?: string;
  translator?: (text: string, targetLang: string) => Promise<string | null>;
}

/**
 * Dynamically resolves, translates via DeepL if missing, persists into public.localizations,
 * and updates cache.
 */
export async function resolveAndTranslateLocalization({
  slug,
  lang,
  fallbackText,
  translator = translateWithDeepL,
}: ResolveAndTranslateOptions): Promise<LocalizationRecord | null> {
  if (!slug || !lang) return null;

  const normalizedSlug = slug.trim();
  const normalizedLang = lang.trim();
  const canonicalSlug = resolveCanonicalSlug(normalizedSlug);

  // If English is requested, check if we have base English text
  if (isEnglishLanguage(normalizedLang)) {
    const baseEnglish = await fetchBaseEnglishText(
      normalizedSlug,
      fallbackText,
    );
    if (baseEnglish) {
      return {
        id: '00000000-0000-0000-0000-000000000000',
        slug: normalizedSlug,
        lang: normalizedLang,
        languageName: getLanguageName(normalizedLang) || 'English',
        text: baseEnglish,
        value: baseEnglish,
        codepage: 'UTF-8',
        direction: 'ltr',
        description: `Base English text for ${canonicalSlug}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }
    return null;
  }

  // Non-English: Fetch base English text to translate
  const baseEnglish = await fetchBaseEnglishText(normalizedSlug, fallbackText);
  if (!baseEnglish) {
    return null;
  }

  try {
    const translatedText = await translator(baseEnglish, normalizedLang);
    if (translatedText && translatedText.trim().length > 0) {
      // Save to localizations table under normalizedSlug
      const rows = await db
        .insert(localizations)
        .values({
          slug: normalizedSlug,
          lang: normalizedLang,
          languageName: getLanguageName(normalizedLang),
          text: translatedText,
          codepage: 'UTF-8',
          direction: 'ltr',
          description: `Auto-translated via DeepL from base '${canonicalSlug}'`,
        })
        .onConflictDoUpdate({
          target: [localizations.slug, localizations.lang],
          set: {
            text: translatedText,
            languageName: getLanguageName(normalizedLang),
            codepage: 'UTF-8',
            direction: 'ltr',
            description: `Auto-translated via DeepL from base '${canonicalSlug}'`,
            updatedAt: new Date(),
          },
        })
        .returning();

      dirtyCache();

      if (rows.length > 0) {
        return mapLocalizationRow(rows[0]);
      }

      return {
        id: '00000000-0000-0000-0000-000000000000',
        slug: normalizedSlug,
        lang: normalizedLang,
        languageName: getLanguageName(normalizedLang),
        text: translatedText,
        value: translatedText,
        codepage: 'UTF-8',
        direction: 'ltr',
        description: `Auto-translated via DeepL from base '${canonicalSlug}'`,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }
  } catch (err) {
    logger.warn(
      `[LOCALIZATION_RESOLVER] Translation failed for slug '${normalizedSlug}' (${normalizedLang}):`,
      err,
    );
  }

  // Fallback if translation fails: return base English text
  return {
    id: '00000000-0000-0000-0000-000000000000',
    slug: normalizedSlug,
    lang: normalizedLang,
    languageName: getLanguageName(normalizedLang),
    text: baseEnglish,
    value: baseEnglish,
    codepage: 'UTF-8',
    direction: 'ltr',
    description: `Fallback base text for ${canonicalSlug}`,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
