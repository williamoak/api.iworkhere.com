/**
 * @myDocBlock v2.3
 * @file POST.test.ts
 * @internal
 * @module tests/routes/v1/auth/login
 * @tag auth, login, test
 * @version 1.0.0
 * @path tests/routes/v1/auth/login/POST.test.ts
 * @summary Tests POST /v1/auth/login endpoint glue logic.
 * @description
 * Verifies that the login endpoint correctly orchestrates auth services,
 * handles success responses, and translates AuthError failures into HTTP
 * responses. Auth business logic is mocked and tested separately.
 *
 * Also verifies that the endpoint exports a Zod `schema` definition for
 * request validation.
 *
 * @requires
 * {
 *   "services": [
 *     "authContext",
 *     "authUserResolver",
 *     "passwordService",
 *     "tokenService"
 *   ]
 * }
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

// Local mocks MUST be declared before importing the modules that use them.
// This keeps service unit tests free to import the real implementations.
vi.mock('@services/auth/authUserResolver', () => ({
  __esModule: true,
  resolveUserForApplication: vi.fn(),
}));

vi.mock('@services/auth/passwordService', () => ({
  __esModule: true,
  verifyPassword: vi.fn(),
}));

vi.mock('@services/auth/tokenService', () => ({
  __esModule: true,
  issueLoginTokens: vi.fn(),
}));

import POST, { schema } from '@routes/v1/auth/login/POST';
import { AuthError, resolveAuthContext } from '@services/auth/authContext';
import { resolveUserForApplication } from '@services/auth/authUserResolver';
import { verifyPassword } from '@services/auth/passwordService';
import { issueLoginTokens } from '@services/auth/tokenService';

type ResMock = Response & {
  statusCode: number;
  body: unknown;
};

function createReq(body: unknown, validatedBody?: unknown): Request {
  return {
    body,
    validated: validatedBody ? { body: validatedBody } : undefined,
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

describe('POST /v1/auth/login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports a request body schema', () => {
    expect(schema).toBeDefined();
    expect(schema.body).toBeDefined();
  });

  it('returns user, application, and tokens on success', async () => {
    vi.mocked(resolveAuthContext).mockResolvedValue({
      applicationId: 'app-123',
      applicationKey: 'bill.iworkhere.com',
    } as any);

    vi.mocked(resolveUserForApplication).mockResolvedValue({
      userId: 'user-123',
      username: 'bill',
      email: 'bill@example.com',
    } as any);

    vi.mocked(verifyPassword).mockResolvedValue(undefined);

    vi.mocked(issueLoginTokens).mockResolvedValue({
      access: {
        token: 'access-token',
        expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      },
      refresh: {
        token: 'refresh-token',
        expiresAt: new Date('2030-01-02T00:00:00.000Z'),
      },
    } as any);

    const req = createReq({
      app_key: 'bill.iworkhere.com',
      identifier: 'bill',
      password: 'plaintext-password',
    });
    const res = createRes();

    await POST(req, res);

    expect(resolveAuthContext).toHaveBeenCalledWith({
      app_key: 'bill.iworkhere.com',
      identifier: 'bill',
      password: 'plaintext-password',
    });
    expect(resolveUserForApplication).toHaveBeenCalledWith('bill', 'app-123');
    expect(verifyPassword).toHaveBeenCalledWith(
      'user-123',
      'plaintext-password',
    );
    expect(issueLoginTokens).toHaveBeenCalledWith('user-123', 'app-123');

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      user: {
        id: 'user-123',
        username: 'bill',
        email: 'bill@example.com',
        status: 'active',
      },
      application: {
        id: 'app-123',
        app_key: 'bill.iworkhere.com',
      },
      tokens: {
        access: {
          token: 'access-token',
          expires_at: '2030-01-01T00:00:00.000Z',
        },
        refresh: {
          token: 'refresh-token',
          expires_at: '2030-01-02T00:00:00.000Z',
        },
      },
    });
  });

  it('uses req.validated.body when present', async () => {
    vi.mocked(resolveAuthContext).mockResolvedValue({
      applicationId: 'app-456',
      applicationKey: 'validated.example.com',
    } as any);

    vi.mocked(resolveUserForApplication).mockResolvedValue({
      userId: 'user-456',
      username: 'validated-user',
      email: 'validated@example.com',
    } as any);

    vi.mocked(verifyPassword).mockResolvedValue(undefined);

    vi.mocked(issueLoginTokens).mockResolvedValue({
      access: {
        token: 'access-token-2',
        expiresAt: new Date('2030-02-01T00:00:00.000Z'),
      },
      refresh: {
        token: 'refresh-token-2',
        expiresAt: new Date('2030-02-02T00:00:00.000Z'),
      },
    } as any);

    const validatedBody = {
      app_key: 'validated.example.com',
      identifier: 'validated-user',
      password: 'validated-password',
    };

    const req = createReq(
      {
        app_key: 'ignored.example.com',
        identifier: 'ignored',
        password: 'ignored',
      },
      validatedBody,
    );
    const res = createRes();

    await POST(req, res);

    expect(resolveAuthContext).toHaveBeenCalledWith(validatedBody);
    expect(resolveUserForApplication).toHaveBeenCalledWith(
      'validated-user',
      'app-456',
    );
    expect(verifyPassword).toHaveBeenCalledWith(
      'user-456',
      'validated-password',
    );
    expect(issueLoginTokens).toHaveBeenCalledWith('user-456', 'app-456');
    expect(res.statusCode).toBe(200);
  });

  it('returns AuthError response when resolveAuthContext throws AuthError', async () => {
    vi.mocked(resolveAuthContext).mockRejectedValue(
      new AuthError('INVALID_APP', 'Invalid application', 400),
    );

    const req = createReq({
      app_key: 'bad-app',
      identifier: 'bill',
      password: 'plaintext-password',
    });
    const res = createRes();

    await POST(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: 'INVALID_APP',
      message: 'Invalid application',
    });
  });

  it('returns AuthError response when downstream auth service throws AuthError', async () => {
    vi.mocked(resolveAuthContext).mockResolvedValue({
      applicationId: 'app-123',
      applicationKey: 'bill.iworkhere.com',
    } as any);

    vi.mocked(resolveUserForApplication).mockRejectedValue(
      new AuthError('USER_NOT_ALLOWED', 'User not allowed for this app', 403),
    );

    const req = createReq({
      app_key: 'bill.iworkhere.com',
      identifier: 'bill',
      password: 'plaintext-password',
    });
    const res = createRes();

    await POST(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({
      error: 'USER_NOT_ALLOWED',
      message: 'User not allowed for this app',
    });
  });

  it('returns 500 on unexpected errors', async () => {
    vi.mocked(resolveAuthContext).mockRejectedValue(new Error('boom'));

    const req = createReq({
      app_key: 'bill.iworkhere.com',
      identifier: 'bill',
      password: 'plaintext-password',
    });
    const res = createRes();

    await POST(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  });
});
