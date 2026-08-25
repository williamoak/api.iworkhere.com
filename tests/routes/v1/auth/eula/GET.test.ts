/**
 * @myDocBlock v2.3
 * @file GET.test.ts
 * @internal
 * @module tests/routes/v1/auth/eula
 * @tag auth, eula, test
 * @version 1.1.0
 * @path tests/routes/v1/auth/eula/GET.test.ts
 * @summary Tests GET /v1/auth/eula endpoint glue logic and localization fallback.
 * @description
 * Verifies that the EULA endpoint correctly retrieves the latest record,
 * handles multilingual requests (English direct, Non-English via localizations / DeepL translation),
 * and caches translated EULA entries in the localization database.
 *
 * @requires
 * {
 *   "services": [
 *     "dbService",
 *     "translationService"
 *   ]
 * }
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

import { __test__, makeGetEulaHandler, isEnglishLanguage } from '@routes/v1/auth/eula/GET';
import type { Localization } from '@db/schema/localizations';

type ResMock = Response & {
  statusCode: number;
  body: unknown;
};

type EulaRecord = {
  name: 'eula';
  version: string;
  value: unknown;
  updatedAt: Date;
};

function createReq(query: Record<string, any> = {}, headers: Record<string, string> = {}): Request {
  return {
    query,
    headers,
    get: (key: string) => headers[key.toLowerCase()] || headers[key],
  } as unknown as Request;
}

function createRes(): ResMock {
  return {
    statusCode: 0,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  } as ResMock;
}

function createRepo(record: EulaRecord | null) {
  return {
    getLatest: vi.fn().mockResolvedValue(record),
  };
}

function createLocRepo(existingLoc: Localization | null = null) {
  return {
    findBySlugAndLang: vi.fn().mockResolvedValue(existingLoc),
    save: vi.fn().mockImplementation(async (data: any) => ({
      id: 'mock-uuid',
      ...data,
      createdAt: new Date('2026-08-24T00:00:00.000Z'),
      updatedAt: new Date('2026-08-24T00:00:00.000Z'),
    })),
  };
}

describe('GET /v1/auth/eula', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports the unit-test seams', () => {
    expect(__test__).toBeDefined();
    expect(__test__.fetchLatestEula).toBeDefined();
    expect(__test__.makeGetEulaHandler).toBeDefined();
    expect(__test__.isEnglishLanguage).toBeDefined();
    expect(makeGetEulaHandler).toBeDefined();
  });

  describe('isEnglishLanguage helper', () => {
    it('recognizes English codes as English', () => {
      expect(isEnglishLanguage()).toBe(true);
      expect(isEnglishLanguage('en')).toBe(true);
      expect(isEnglishLanguage('eng')).toBe(true);
      expect(isEnglishLanguage('en_ca')).toBe(true);
      expect(isEnglishLanguage('en-US')).toBe(true);
      expect(isEnglishLanguage('en_gb')).toBe(true);
      expect(isEnglishLanguage('can_en')).toBe(true);
      expect(isEnglishLanguage('us_en')).toBe(true);
    });

    it('recognizes non-English codes as non-English', () => {
      expect(isEnglishLanguage('can_fr')).toBe(false);
      expect(isEnglishLanguage('fr')).toBe(false);
      expect(isEnglishLanguage('fr_ca')).toBe(false);
      expect(isEnglishLanguage('es')).toBe(false);
      expect(isEnglishLanguage('de')).toBe(false);
    });
  });

  describe('English requests', () => {
    it('returns 200 with normalized EULA record from config table', async () => {
      const record: EulaRecord = {
        name: 'eula',
        version: '1.00',
        value: {
          text: 'Terms and conditions',
        },
        updatedAt: new Date('2030-01-01T00:00:00.000Z'),
      };

      const repo = createRepo(record);
      const locRepo = createLocRepo();
      const handler = makeGetEulaHandler(repo, locRepo);
      const req = createReq();
      const res = createRes();

      await handler(req, res);

      expect(repo.getLatest).toHaveBeenCalledTimes(1);
      expect(locRepo.findBySlugAndLang).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({
        name: 'eula',
        version: '1.00',
        value: 'Terms and conditions',
        lineCount: 1,
        updatedAt: '2030-01-01T00:00:00.000Z',
      });
    });

    it('returns 404 when no EULA exists', async () => {
      const repo = createRepo(null);
      const handler = makeGetEulaHandler(repo);
      const req = createReq();
      const res = createRes();

      await handler(req, res);

      expect(repo.getLatest).toHaveBeenCalledTimes(1);
      expect(res.statusCode).toBe(404);
      expect(res.body).toEqual({
        error: 'EULA not found',
      });
    });

    it('parses JSON string values into objects', async () => {
      const record: EulaRecord = {
        name: 'eula',
        version: '2.00',
        value: '{"text":"Terms and conditions"}',
        updatedAt: new Date('2030-02-01T00:00:00.000Z'),
      };

      const repo = createRepo(record);
      const handler = makeGetEulaHandler(repo);
      const req = createReq();
      const res = createRes();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({
        name: 'eula',
        version: '2.00',
        value: 'Terms and conditions',
        lineCount: 1,
        updatedAt: '2030-02-01T00:00:00.000Z',
      });
    });

    it('preserves non-JSON string values as-is', async () => {
      const record: EulaRecord = {
        name: 'eula',
        version: '3.00',
        value: 'plain text eula content',
        updatedAt: new Date('2030-03-01T00:00:00.000Z'),
      };

      const repo = createRepo(record);
      const handler = makeGetEulaHandler(repo);
      const req = createReq();
      const res = createRes();

      await handler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({
        name: 'eula',
        version: '3.00',
        value: 'plain text eula content',
        lineCount: 1,
        updatedAt: '2030-03-01T00:00:00.000Z',
      });
    });
  });

  describe('Non-English requests', () => {
    it('returns cached localized EULA when found in localizations table', async () => {
      const configRepo = createRepo({
        name: 'eula',
        version: '1.00',
        value: 'English text',
        updatedAt: new Date('2026-08-24T00:00:00.000Z'),
      });
      const locRepo = createLocRepo({
        id: 'loc-1',
        slug: 'eula',
        lang: 'can_fr',
        languageName: 'French',
        text: 'Texte en français du CLUF',
        codepage: 'UTF-8',
        direction: 'ltr',
        description: 'CLUF',
        createdAt: new Date('2026-08-24T00:00:00.000Z'),
        updatedAt: new Date('2026-08-24T01:00:00.000Z'),
      });
      const translator = vi.fn();

      const handler = makeGetEulaHandler(configRepo, locRepo, translator);
      const req = createReq({ lang: 'can_fr' });
      const res = createRes();

      await handler(req, res);

      expect(locRepo.findBySlugAndLang).toHaveBeenCalledWith('eula', 'can_fr');
      expect(translator).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({
        name: 'eula',
        version: '1.00',
        value: 'Texte en français du CLUF',
        lineCount: 1,
        updatedAt: '2026-08-24T01:00:00.000Z',
        lang: 'can_fr',
        isTranslated: true,
      });
    });

    it('translates via translator and saves to localization table on cache miss', async () => {
      const configRepo = createRepo({
        name: 'eula',
        version: '1.00',
        value: 'English EULA agreement terms',
        updatedAt: new Date('2026-08-24T00:00:00.000Z'),
      });
      const locRepo = createLocRepo(null);
      const translator = vi.fn().mockResolvedValue('Termes du contrat de licence en français');

      const handler = makeGetEulaHandler(configRepo, locRepo, translator);
      const req = createReq({}, { 'x-lang': 'can_fr' });
      const res = createRes();

      await handler(req, res);

      expect(locRepo.findBySlugAndLang).toHaveBeenCalledWith('eula', 'can_fr');
      expect(configRepo.getLatest).toHaveBeenCalled();
      expect(translator).toHaveBeenCalledWith('English EULA agreement terms', 'can_fr');
      expect(locRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          slug: 'eula',
          lang: 'can_fr',
          text: 'Termes du contrat de licence en français',
        })
      );
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(
        expect.objectContaining({
          name: 'eula',
          version: '1.00',
          value: 'Termes du contrat de licence en français',
          lang: 'can_fr',
          isTranslated: true,
        })
      );
    });

    it('falls back to English when translation fails or translator returns null', async () => {
      const configRepo = createRepo({
        name: 'eula',
        version: '1.00',
        value: 'English fallback text',
        updatedAt: new Date('2026-08-24T00:00:00.000Z'),
      });
      const locRepo = createLocRepo(null);
      const translator = vi.fn().mockResolvedValue(null);

      const handler = makeGetEulaHandler(configRepo, locRepo, translator);
      const req = createReq({ lang: 'es' });
      const res = createRes();

      await handler(req, res);

      expect(locRepo.findBySlugAndLang).toHaveBeenCalledWith('eula', 'es');
      expect(translator).toHaveBeenCalled();
      expect(locRepo.save).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({
        name: 'eula',
        version: '1.00',
        value: 'English fallback text',
        lineCount: 1,
        updatedAt: '2026-08-24T00:00:00.000Z',
      });
    });
  });
});
