/**
 * @myDocBlock v2.3
 * @file GET.test.ts
 * @internal
 * @module tests/routes/v1/auth/eula
 * @tag auth, eula, test
 * @version 1.0.0
 * @path tests/routes/v1/auth/eula/GET.test.ts
 * @summary Tests GET /v1/auth/eula endpoint glue logic.
 * @description
 * Verifies that the EULA endpoint correctly retrieves the latest record,
 * normalizes stored values into the public response contract, and returns
 * a 404 when no EULA exists. Repository access is mocked and tested separately.
 *
 * Also verifies that the endpoint exports a handler factory seam for unit tests.
 *
 * @requires
 * {
 *   "services": [
 *     "dbService"
 *   ]
 * }
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

import { __test__, makeGetEulaHandler } from '@routes/v1/auth/eula/GET';

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

function createReq(): Request {
  return {} as Request;
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

describe('GET /v1/auth/eula', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports the unit-test seams', () => {
    expect(__test__).toBeDefined();
    expect(__test__.fetchLatestEula).toBeDefined();
    expect(__test__.makeGetEulaHandler).toBeDefined();
    expect(makeGetEulaHandler).toBeDefined();
  });

  it('returns 200 with normalized EULA record', async () => {
    const record: EulaRecord = {
      name: 'eula',
      version: '1.00',
      value: {
        text: 'Terms and conditions',
      },
      updatedAt: new Date('2030-01-01T00:00:00.000Z'),
    };

    const repo = createRepo(record);
    const handler = makeGetEulaHandler(repo);
    const req = createReq();
    const res = createRes();

    await handler(req, res);

    expect(repo.getLatest).toHaveBeenCalledTimes(1);
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

  it('preserves empty string values as-is', async () => {
    const record: EulaRecord = {
      name: 'eula',
      version: '4.00',
      value: '   ',
      updatedAt: new Date('2030-04-01T00:00:00.000Z'),
    };

    const repo = createRepo(record);
    const handler = makeGetEulaHandler(repo);
    const req = createReq();
    const res = createRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      name: 'eula',
      version: '4.00',
      value: '   ',
      lineCount: 1,
      updatedAt: '2030-04-01T00:00:00.000Z',
    });
  });
});