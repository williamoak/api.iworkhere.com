/**
 * @myDocBlock v2.3
 * @file GET.test.ts
 * @internal
 * @module tests/routes/v1/auth/oauth/google/callback
 * @tag auth, oauth, google, test
 * @version 1.0.3
 * @path tests/routes/v1/auth/oauth/google/callback/GET.test.ts
 * @summary Tests GET /v1/auth/oauth/google/callback endpoint.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

// Define mocks in hoisted scope so vi.mock can access them
const { insertBuilderMock } = vi.hoisted(() => ({
  insertBuilderMock: {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn(),
  },
}));

// Setup mocks
vi.mock('@helpers/config', () => ({ getGoogleOAuthConfig: vi.fn() }));
vi.mock('@services/auth/oauthStateService', () => ({ verifyState: vi.fn() }));
vi.mock('@services/auth/authContext', () => ({ resolveAuthContext: vi.fn() }));
vi.mock('@services/auth/tokenService', () => ({ issueLoginTokens: vi.fn() }));
vi.mock('@db/schema', () => ({
  userAuthOauth: {
    name: 'user_auth_oauth',
    provider: 'provider',
    providerAccountId: 'providerAccountId',
  },
  users: { name: 'users' },
}));
vi.mock('@services/dbService', () => ({
  db: {
    query: {
      userAuthOauth: { findFirst: vi.fn() },
      users: { findFirst: vi.fn() },
    },
    insert: vi.fn().mockReturnValue(insertBuilderMock),
  },
}));

import GET from '@routes/v1/auth/oauth/google/callback/GET';
import { getGoogleOAuthConfig } from '@helpers/config';
import { verifyState } from '@services/auth/oauthStateService';
import { resolveAuthContext } from '@services/auth/authContext';
import { issueLoginTokens } from '@services/auth/tokenService';
import { db } from '@services/dbService';

type ResMock = Response & {
  statusCode: number;
  body: unknown;
  redirectUrl: string;
  status(code: number): any;
  json(payload: unknown): any;
  redirect(code: number, url: string): any;
};

function createRes(): ResMock {
  return {
    statusCode: 0,
    body: undefined,
    redirectUrl: '',
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    redirect(code: number, url: string) {
      this.statusCode = code;
      this.redirectUrl = url;
      return this;
    },
  } as ResMock;
}

describe('GET /v1/auth/oauth/google/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    // Reset the returning mock value specifically
    insertBuilderMock.returning.mockResolvedValue([{ userId: 'user-123' }]);
  });

  it('redirects to failure URL on error query', async () => {
    vi.mocked(getGoogleOAuthConfig).mockReturnValue({
      failureRedirectUrl: '/error',
    } as any);
    const req = { query: { error: 'access_denied' } } as unknown as Request;
    const res = createRes();

    await GET(req, res);

    expect(res.statusCode).toBe(302);
    expect(res.redirectUrl).toBe('/error');
  });

  it('exchanges code and issues tokens on success', async () => {
    vi.mocked(getGoogleOAuthConfig).mockReturnValue({
      tokenUrl: 'https://token.url',
      userInfoUrl: 'https://userinfo.url',
    } as any);
    vi.mocked(verifyState).mockReturnValue({
      app_key: 'bill.iworkhere.com',
    } as any);
    vi.mocked(resolveAuthContext).mockResolvedValue({
      applicationId: 'app-1',
      applicationKey: 'bill.iworkhere.com',
    } as any);
    vi.mocked(issueLoginTokens).mockResolvedValue({
      access: { token: 'at', expiresAt: new Date() },
      refresh: { token: 'rt', expiresAt: new Date() },
    } as any);

    // Mock fetch responses
    vi.mocked(fetch).mockImplementation(async (url: any) => {
      if (url === 'https://token.url')
        return {
          ok: true,
          json: () => Promise.resolve({ access_token: 'valid_token' }),
        } as any;
      if (url === 'https://userinfo.url')
        return {
          ok: true,
          json: () =>
            Promise.resolve({ sub: 'google-123', email: 'test@example.com' }),
        } as any;
    });

    // Mock DB: user not found, so it inserts.
    vi.mocked(db.query.userAuthOauth.findFirst).mockResolvedValue(undefined);
    vi.mocked(db.query.users.findFirst).mockResolvedValue(undefined);

    const req = {
      query: { code: 'code123', state: 'state123' },
    } as unknown as Request;
    const res = createRes();

    await GET(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('tokens');
    expect(issueLoginTokens).toHaveBeenCalledWith('user-123', 'app-1');
  });
});

