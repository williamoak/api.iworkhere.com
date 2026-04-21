import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import crypto from 'crypto';

const dbSelectMock = vi.fn();
const dbFromMock = vi.fn();
const dbWhereMock = vi.fn();
const dbLimitMock = vi.fn();

vi.mock('@services/dbService', () => ({
  db: {
    select: dbSelectMock,
  },
}));

vi.mock('@db/schema', () => ({
  authTokens: {
    userId: 'user_id',
    tokenHash: 'token_hash',
    tokenType: 'token_type',
    revokedAt: 'revoked_at',
    expiresAt: 'expires_at',
  },
}));

const andMock = vi.fn(() => ({}));
const eqMock = vi.fn(() => ({}));
const gtMock = vi.fn(() => ({}));
const isNullMock = vi.fn(() => ({}));

vi.mock('drizzle-orm', () => ({
  and: andMock,
  eq: eqMock,
  gt: gtMock,
  isNull: isNullMock,
}));

import { authMiddleware } from '@middleware/authMiddleware';

type ResMock = Response & {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
};

function createReq(authorization?: string, requestId?: string): Request {
  const headers: Record<string, string> = {};

  if (authorization !== undefined) {
    headers.authorization = authorization;
  }

  if (requestId !== undefined) {
    headers['x-request-id'] = requestId;
  }

  return {
    method: 'GET',
    url: '/v1/auth/me',
    ip: '127.0.0.1',
    get(name: string) {
      return headers[name.toLowerCase()];
    },
  } as unknown as Request;
}

function createRes(): ResMock {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    setHeader(key: string, value: string) {
      this.headers[key.toLowerCase()] = value;
    },
  };

  return res as unknown as ResMock;
}

function createNext(): NextFunction {
  return vi.fn() as unknown as NextFunction;
}

function mockTokenLookup(rows: Array<{ userId: string }>) {
  dbLimitMock.mockResolvedValueOnce(rows);
  dbWhereMock.mockReturnValueOnce({
    limit: dbLimitMock,
  });
  dbFromMock.mockReturnValueOnce({
    where: dbWhereMock,
  });
  dbSelectMock.mockReturnValueOnce({
    from: dbFromMock,
  });
}

describe('authMiddleware', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env.AUTH_MW_DEBUG;
    vi.resetModules();
  });

  test('returns 401 when bearer token is missing', async () => {
    const req = createReq();
    const res = createRes();
    const next = createNext();

    await authMiddleware()(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'UNAUTHORIZED' });
    expect(next).not.toHaveBeenCalled();
    expect(dbSelectMock).not.toHaveBeenCalled();
  });

  test('returns 401 when authorization scheme is not bearer', async () => {
    const req = createReq('Basic abc123');
    const res = createRes();
    const next = createNext();

    await authMiddleware()(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'UNAUTHORIZED' });
    expect(next).not.toHaveBeenCalled();
    expect(dbSelectMock).not.toHaveBeenCalled();
  });

  test('returns 401 when bearer token is empty', async () => {
    const req = createReq('Bearer ');
    const res = createRes();
    const next = createNext();

    await authMiddleware()(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'UNAUTHORIZED' });
    expect(next).not.toHaveBeenCalled();
    expect(dbSelectMock).not.toHaveBeenCalled();
  });

  test('returns 401 when bearer token is whitespace only', async () => {
    const req = createReq('bearer     ');
    const res = createRes();
    const next = createNext();

    await authMiddleware()(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'UNAUTHORIZED' });
    expect(next).not.toHaveBeenCalled();
    expect(dbSelectMock).not.toHaveBeenCalled();
  });

  test('returns 401 when token lookup finds no active access token', async () => {
    mockTokenLookup([]);

    const req = createReq('Bearer stale-token');
    const res = createRes();
    const next = createNext();

    await authMiddleware()(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'UNAUTHORIZED' });
    expect(next).not.toHaveBeenCalled();
    expect(dbSelectMock).toHaveBeenCalledTimes(1);
    expect(dbFromMock).toHaveBeenCalledTimes(1);
    expect(dbWhereMock).toHaveBeenCalledTimes(1);
    expect(dbLimitMock).toHaveBeenCalledTimes(1);
  });

  test('attaches req.auth and calls next for valid access token', async () => {
    mockTokenLookup([{ userId: 'user-123' }]);

    const req = createReq('Bearer valid-access-token');
    const res = createRes();
    const next = createNext();

    await authMiddleware()(req, res, next);

    expect((req as Request & { auth?: { userId: string } }).auth).toEqual({
      userId: 'user-123',
    });
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(0);
    expect(res.body).toBeUndefined();

    const expectedHash = crypto
      .createHash('sha256')
      .update('valid-access-token')
      .digest('hex');

    expect(expectedHash).toHaveLength(64);
    expect(andMock).toHaveBeenCalled();
    expect(eqMock).toHaveBeenCalled();
    expect(gtMock).toHaveBeenCalled();
    expect(isNullMock).toHaveBeenCalled();
    expect(dbSelectMock).toHaveBeenCalledTimes(1);
    expect(dbFromMock).toHaveBeenCalledTimes(1);
    expect(dbWhereMock).toHaveBeenCalledTimes(1);
    expect(dbLimitMock).toHaveBeenCalledTimes(1);
  });

  test('returns 401 when token lookup fails due to wrong token type', async () => {
    mockTokenLookup([]);

    const req = createReq('Bearer refresh-token-used-as-access');
    const res = createRes();
    const next = createNext();

    await authMiddleware()(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'UNAUTHORIZED' });
    expect(next).not.toHaveBeenCalled();
    expect(dbSelectMock).toHaveBeenCalledTimes(1);
  });

  test('returns next(err) when database lookup throws', async () => {
    const dbError = new Error('database unavailable');

    dbLimitMock.mockRejectedValueOnce(dbError);
    dbWhereMock.mockReturnValueOnce({
      limit: dbLimitMock,
    });
    dbFromMock.mockReturnValueOnce({
      where: dbWhereMock,
    });
    dbSelectMock.mockReturnValueOnce({
      from: dbFromMock,
    });

    const req = createReq('Bearer valid-access-token');
    const res = createRes();
    const next = vi.fn() as unknown as NextFunction;

    await authMiddleware()(req, res, next);

    expect(res.statusCode).toBe(0);
    expect(res.body).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(dbError);
  });

  test('in debug mode returns debug metadata in the 401 response', async () => {
    process.env.AUTH_MW_DEBUG = '1';
    vi.resetModules();

    const { authMiddleware: debugAuthMiddleware } = await import(
      '@middleware/authMiddleware'
      );

    const req = createReq();
    const res = createRes();
    const next = createNext();

    await debugAuthMiddleware()(req, res, next);

    expect(res.statusCode).toBe(401);

    const body = res.body as {
      error?: string;
      debug?: { reqId?: string; reason?: string };
    };

    expect(body).toBeDefined();
    expect(body.error).toBe('UNAUTHORIZED');
    expect(body.debug?.reqId).toEqual(expect.any(String));
    expect(body.debug?.reason).toBe('MISSING_OR_INVALID_BEARER');

    expect(res.headers['x-debug-req-id']).toBeDefined();
    expect(res.headers['x-debug-auth-reason']).toBe(
      'MISSING_OR_INVALID_BEARER',
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('trims x-request-id to 128 characters before using it as reqId', async () => {
    const longRequestId = 'x'.repeat(200);

    mockTokenLookup([]);

    const req = createReq('Bearer stale-token', longRequestId);
    const res = createRes();
    const next = createNext();

    await authMiddleware()(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
    expect(res.body).toEqual({ error: 'UNAUTHORIZED' });
    expect(res.headers['x-debug-req-id']).toBeUndefined();
  });
});