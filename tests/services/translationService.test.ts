/**
 * @myDocBlock v2.3
 * @file translationService.test.ts
 * @internal
 * @module tests/services/translationService
 * @tag translation, deepl, test
 * @version 1.0.0
 * @path tests/services/translationService.test.ts
 * @summary Tests DeepL translation service helpers and API invocation.
 * @description
 * Verifies that target language mapping, human-readable language names,
 * and translateWithDeepL endpoint invocation work as expected under different configurations.
 *
 * @requires
 * {
 *   "services": [
 *     "translationService"
 *   ]
 * }
 */

import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import {
  mapToDeepLTargetLang,
  getLanguageName,
  translateWithDeepL,
  LANGUAGE_NAME_MAP,
  DEEPL_TARGET_LANG_MAP,
} from '@services/translationService';

describe('translationService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('mapToDeepLTargetLang', () => {
    it('maps Canadian French and standard French variants to FR', () => {
      expect(mapToDeepLTargetLang('can_fr')).toBe('FR');
      expect(mapToDeepLTargetLang('fr_ca')).toBe('FR');
      expect(mapToDeepLTargetLang('fr')).toBe('FR');
      expect(mapToDeepLTargetLang('fra')).toBe('FR');
      expect(mapToDeepLTargetLang('french')).toBe('FR');
    });

    it('maps Spanish, German, Italian, and Japanese variants', () => {
      expect(mapToDeepLTargetLang('es')).toBe('ES');
      expect(mapToDeepLTargetLang('spanish')).toBe('ES');
      expect(mapToDeepLTargetLang('de')).toBe('DE');
      expect(mapToDeepLTargetLang('german')).toBe('DE');
      expect(mapToDeepLTargetLang('it')).toBe('IT');
      expect(mapToDeepLTargetLang('ja')).toBe('JA');
    });

    it('maps Portuguese dialects', () => {
      expect(mapToDeepLTargetLang('pt_br')).toBe('PT-BR');
      expect(mapToDeepLTargetLang('pt_pt')).toBe('PT-PT');
      expect(mapToDeepLTargetLang('pt')).toBe('PT-PT');
    });

    it('falls back gracefully to uppercase base tag for other languages', () => {
      expect(mapToDeepLTargetLang('ko_kr')).toBe('KO');
      expect(mapToDeepLTargetLang('sv')).toBe('SV');
    });
  });

  describe('getLanguageName', () => {
    it('returns proper English name for language codes', () => {
      expect(getLanguageName('')).toBe('English');
      expect(getLanguageName('en')).toBe('English');
      expect(getLanguageName('can_fr')).toBe('French');
      expect(getLanguageName('fr_ca')).toBe('French');
      expect(getLanguageName('fr')).toBe('French');
      expect(getLanguageName('fra')).toBe('French');
      expect(getLanguageName('es')).toBe('Spanish');
      expect(getLanguageName('de')).toBe('German');
      expect(getLanguageName('it')).toBe('Italian');
      expect(getLanguageName('ja')).toBe('Japanese');
      expect(getLanguageName('zh')).toBe('Chinese');
      expect(getLanguageName('pt')).toBe('Portuguese');
      expect(getLanguageName('ru')).toBe('Russian');
      expect(getLanguageName('nl')).toBe('Dutch');
      expect(getLanguageName('pl')).toBe('Polish');
    });

    it('falls back to uppercase for unknown language codes', () => {
      expect(getLanguageName('custom_lang')).toBe('CUSTOM_LANG');
    });

    it('exports expected lookup dictionaries', () => {
      expect(LANGUAGE_NAME_MAP).toBeDefined();
      expect(DEEPL_TARGET_LANG_MAP).toBeDefined();
    });
  });

  describe('translateWithDeepL', () => {
    it('returns original text if input is empty or whitespace', async () => {
      expect(await translateWithDeepL('', 'can_fr')).toBe('');
      expect(await translateWithDeepL('   ', 'can_fr')).toBe('   ');
    });

    it('returns null and logs warning if no API key is configured', async () => {
      delete process.env.DEEPL_API_KEY;
      delete process.env.DEEPL_KEY;
      delete process.env.DEEPL_AUTH_KEY;

      const result = await translateWithDeepL('Hello world', 'can_fr');
      expect(result).toBeNull();
    });

    it('sends POST request to DeepL free endpoint when key ends with :fx', async () => {
      process.env.DEEPL_API_KEY = 'mock-key-123:fx';

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          translations: [{ text: 'Bonjour le monde', detected_source_language: 'EN' }],
        }),
      });
      global.fetch = mockFetch;

      const result = await translateWithDeepL('Hello world', 'can_fr');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api-free.deepl.com/v2/translate');
      expect(options.method).toBe('POST');
      expect(options.headers).toEqual({
        Authorization: 'DeepL-Auth-Key mock-key-123:fx',
        'Content-Type': 'application/json',
      });
      expect(JSON.parse(options.body)).toEqual({
        text: ['Hello world'],
        target_lang: 'FR',
      });
      expect(result).toBe('Bonjour le monde');
    });

    it('sends POST request to DeepL pro endpoint when key does not end with :fx', async () => {
      process.env.DEEPL_API_KEY = 'pro-key-abc';

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          translations: [{ text: 'Hola mundo', detected_source_language: 'EN' }],
        }),
      });
      global.fetch = mockFetch;

      const result = await translateWithDeepL('Hello world', 'es');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.deepl.com/v2/translate');
      expect(result).toBe('Hola mundo');
    });

    it('handles HTTP error responses gracefully by returning null', async () => {
      process.env.DEEPL_API_KEY = 'mock-key';

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: async () => 'Quota exceeded',
      });

      const result = await translateWithDeepL('Hello world', 'can_fr');
      expect(result).toBeNull();
    });

    it('handles network throw gracefully by returning null', async () => {
      process.env.DEEPL_API_KEY = 'mock-key';

      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await translateWithDeepL('Hello world', 'can_fr');
      expect(result).toBeNull();
    });
  });
});
