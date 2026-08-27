/**
 * @myDocBlock v2.3
 * @file localizationResolverService.test.ts
 * @internal
 * @module tests/services
 * @tag localization, translation, test
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @summary Unit tests for localizationResolverService.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/* Mocks                                                              */
/* ------------------------------------------------------------------ */

interface MockLocalizationRow {
  id?: string;
  slug: string;
  lang: string;
  languageName?: string | null;
  text: string;
  codepage?: string | null;
  direction?: string | null;
  description?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

interface MockConfigRow {
  name: string;
  version: string;
  value: unknown;
}

const mockDbState: {
  localizations: MockLocalizationRow[];
  config: MockConfigRow[];
} = {
  localizations: [],
  config: [],
};

function isConfig(table: unknown): boolean {
  if (!table) return false;
  const t = table as Record<string, unknown>;
  if (
    t.name === 'config' ||
    (t._ as Record<string, unknown>)?.name === 'config'
  )
    return true;
  if (typeof table === 'object') {
    for (const sym of Object.getOwnPropertySymbols(table)) {
      if ((table as Record<symbol, unknown>)[sym] === 'config') return true;
    }
  }
  return false;
}

vi.mock('@services/dbService', () => {
  return {
    db: {
      select: vi.fn(() => ({
        from: vi.fn((table: unknown) => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(async (num: number) => {
                if (isConfig(table)) {
                  return mockDbState.config.slice(0, num);
                }
                return mockDbState.localizations.slice(0, num);
              }),
            })),
            limit: vi.fn(async (num: number) => {
              if (isConfig(table)) {
                return mockDbState.config.slice(0, num);
              }
              return mockDbState.localizations.slice(0, num);
            }),
            then: (resolve: (data: unknown) => unknown) => {
              if (isConfig(table)) {
                return resolve(mockDbState.config);
              }
              return resolve(mockDbState.localizations);
            },
          })),
          orderBy: vi.fn(() => ({
            limit: vi.fn(async (num: number) => {
              return mockDbState.localizations.slice(0, num);
            }),
          })),
          then: (resolve: (data: unknown) => unknown) =>
            resolve(mockDbState.localizations),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn((val: MockLocalizationRow) => ({
          onConflictDoUpdate: vi.fn(({ set }: { set?: { text?: string } }) => ({
            returning: vi.fn(async () => {
              const newRow: MockLocalizationRow = {
                id: 'mock-loc-uuid',
                slug: val.slug,
                lang: val.lang,
                languageName: val.languageName || 'French',
                text: set?.text || val.text,
                codepage: 'UTF-8',
                direction: 'ltr',
                description: val.description,
                createdAt: new Date('2026-08-27T00:00:00.000Z'),
                updatedAt: new Date('2026-08-27T00:00:00.000Z'),
              };
              mockDbState.localizations.push(newRow);
              return [newRow];
            }),
          })),
        })),
      })),
    },
  };
});

vi.mock('@cache/localizationCache', () => ({
  dirtyCache: vi.fn(),
  getLanguageCandidates: vi.fn((lang: string) => [lang, 'en']),
}));

import {
  resolveCanonicalSlug,
  fetchBaseEnglishText,
  resolveAndTranslateLocalization,
  mapLocalizationRow,
} from '@services/localizationResolverService';
import { dirtyCache } from '@cache/localizationCache';
import type { Localization } from '@db/schema/localizations';

describe('localizationResolverService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbState.localizations = [];
    mockDbState.config = [];
  });

  describe('resolveCanonicalSlug', () => {
    test('resolves eula aliases to "eula"', () => {
      expect(resolveCanonicalSlug('eula_body_text')).toBe('eula');
      expect(resolveCanonicalSlug('EULA_BODY_TEXT')).toBe('eula');
      expect(resolveCanonicalSlug('eula_text')).toBe('eula');
      expect(resolveCanonicalSlug('eula_content')).toBe('eula');
      expect(resolveCanonicalSlug('eula_body')).toBe('eula');
    });

    test('returns original trimmed slug when no alias exists', () => {
      expect(resolveCanonicalSlug('username')).toBe('username');
      expect(resolveCanonicalSlug('  password_reset_title  ')).toBe(
        'password_reset_title',
      );
    });

    test('handles falsy input gracefully', () => {
      expect(resolveCanonicalSlug('')).toBe('');
      expect(resolveCanonicalSlug(null as unknown as string)).toBe(null);
    });
  });

  describe('mapLocalizationRow', () => {
    test('maps db row to LocalizationRecord with both text and value', () => {
      const row: Localization = {
        id: '123',
        slug: 'welcome',
        lang: 'en',
        languageName: 'English',
        text: 'Welcome',
        codepage: 'UTF-8',
        direction: 'ltr',
        description: 'Greeting',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      };

      const mapped = mapLocalizationRow(row);
      expect(mapped.id).toBe('123');
      expect(mapped.text).toBe('Welcome');
      expect(mapped.value).toBe('Welcome');
      expect(mapped.slug).toBe('welcome');
      expect(mapped.lang).toBe('en');
    });
  });

  describe('fetchBaseEnglishText', () => {
    test('fetches English text from localizations table', async () => {
      mockDbState.localizations = [
        {
          slug: 'username',
          lang: 'eng',
          text: 'Enter your username',
        },
      ];

      const text = await fetchBaseEnglishText('username');
      expect(text).toBe('Enter your username');
    });

    test('fetches English text from config table when name matches canonical slug', async () => {
      mockDbState.config = [
        {
          name: 'eula',
          version: '1.01',
          value: { text: 'EULA Terms and Conditions' },
        },
      ];

      const text = await fetchBaseEnglishText('eula_body_text');
      expect(text).toBe('EULA Terms and Conditions');
    });

    test('fetches English text from config table with string value', async () => {
      mockDbState.config = [
        {
          name: 'eula',
          version: '1.01',
          value: 'Raw string EULA content',
        },
      ];

      const text = await fetchBaseEnglishText('eula_body_text');
      expect(text).toBe('Raw string EULA content');
    });

    test('uses fallbackText when not found in DB', async () => {
      const text = await fetchBaseEnglishText(
        'custom_slug',
        'Default fallback text',
      );
      expect(text).toBe('Default fallback text');
    });
  });

  describe('resolveAndTranslateLocalization', () => {
    test('returns base English record when English language is requested', async () => {
      mockDbState.config = [
        {
          name: 'eula',
          version: '1.01',
          value: { text: 'EULA Agreement' },
        },
      ];

      const record = await resolveAndTranslateLocalization({
        slug: 'eula_body_text',
        lang: 'en_ca',
      });

      expect(record).not.toBeNull();
      expect(record?.text).toBe('EULA Agreement');
      expect(record?.value).toBe('EULA Agreement');
      expect(record?.lang).toBe('en_ca');
    });

    test('translates and saves into localizations table for non-English request', async () => {
      mockDbState.config = [
        {
          name: 'eula',
          version: '1.01',
          value: { text: 'EULA Agreement text in English' },
        },
      ];

      const mockTranslator = vi
        .fn()
        .mockResolvedValue('Texte du contrat EULA en français');

      const record = await resolveAndTranslateLocalization({
        slug: 'eula_body_text',
        lang: 'can_fr',
        translator: mockTranslator,
      });

      expect(mockTranslator).toHaveBeenCalledWith(
        'EULA Agreement text in English',
        'can_fr',
      );
      expect(dirtyCache).toHaveBeenCalled();
      expect(record).not.toBeNull();
      expect(record?.slug).toBe('eula_body_text');
      expect(record?.lang).toBe('can_fr');
      expect(record?.text).toBe('Texte du contrat EULA en français');
      expect(record?.value).toBe('Texte du contrat EULA en français');
    });

    test('falls back to base English text if translation returns null', async () => {
      mockDbState.config = [
        {
          name: 'eula',
          version: '1.01',
          value: { text: 'Base English EULA' },
        },
      ];

      const mockTranslator = vi.fn().mockResolvedValue(null);

      const record = await resolveAndTranslateLocalization({
        slug: 'eula_body_text',
        lang: 'es',
        translator: mockTranslator,
      });

      expect(record).not.toBeNull();
      expect(record?.slug).toBe('eula_body_text');
      expect(record?.lang).toBe('es');
      expect(record?.text).toBe('Base English EULA');
      expect(record?.value).toBe('Base English EULA');
    });

    test('returns null if slug or lang is missing', async () => {
      const res1 = await resolveAndTranslateLocalization({
        slug: '',
        lang: 'fr',
      });
      expect(res1).toBeNull();

      const res2 = await resolveAndTranslateLocalization({
        slug: 'eula',
        lang: '',
      });
      expect(res2).toBeNull();
    });
  });
});
