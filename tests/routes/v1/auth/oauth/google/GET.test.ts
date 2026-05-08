/**
 * @myDocBlock v2.3
 * @file GET.test.ts
 * @internal
 * @module tests/routes/v1/auth/oauth/google
 * @tag auth, oauth, google, test
 * @version 1.0.0
 * @path tests/routes/v1/auth/oauth/google/GET.test.ts
 * @summary Tests GET /v1/auth/oauth/google endpoint.
 * @description
 * Verifies that the Google OAuth start route correctly resolves the
 * application context, generates a signed state, and redirects to
 * Google's authorization endpoint with the required parameters.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('@services/auth/applicationOriginResolver', () => ({
  __esModule: true,
  resolveApplicationFromRequest: vi.fn(),
}));

vi.mock('@services/auth/oauthStateService', () => ({
  __esModule: true,
  signState: vi.fn(),
}));

import GET from '@routes/v1/auth/oauth/google/GET';
import { resolveApplicationFromRequest } from '@services/auth/applicationOriginResolver';
import { signState } from '@services/auth/oauthStateService';

type ResMock = Response & {
  statusCode: number;
  redirectUrl: string;
};

function createRes(): ResMock {
  return {
    statusCode: 0,
    redirectUrl: '',
    redirect(code: number, url: string) {
      this.statusCode = code;
      this.redirectUrl = url;
      return this;
    },
  } as ResMock;
}

describe('GET /v1/auth/oauth/google', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects to Google with correct parameters', async () => {
    vi.mocked(resolveApplicationFromRequest).mockResolvedValue({
      applicationId: 'app-123',
      applicationKey: 'bill.iworkhere.com',
    });

    vi.mocked(signState).mockReturnValue('signed-state-xyz');

    const req = { query: {} } as unknown as Request;
    const res = createRes();

    await GET(req, res);

    expect(resolveApplicationFromRequest).toHaveBeenCalledWith(req);
    expect(signState).toHaveBeenCalledWith('bill.iworkhere.com');

    expect(res.statusCode).toBe(302);
    expect(res.redirectUrl).toContain('https://accounts.google.com/o/oauth2/v2/auth');
    expect(res.redirectUrl).toContain('client_id=');
    expect(res.redirectUrl).toContain('redirect_uri=');
    expect(res.redirectUrl).toContain('response_type=code');
    expect(res.redirectUrl).toContain('scope=openid+email+profile');
    expect(res.redirectUrl).toContain('state=signed-state-xyz');
    expect(res.redirectUrl).toContain('access_type=offline');
    expect(res.redirectUrl).toContain('prompt=consent');
  });

  it('uses app_key from query when provided', async () => {
    vi.mocked(resolveApplicationFromRequest).mockResolvedValue({
      applicationId: 'app-456',
      applicationKey: 'michael.iworkhere.com',
    });

    vi.mocked(signState).mockReturnValue('signed-state-michael');

    const req = { query: { app_key: 'michael.iworkhere.com' } } as unknown as Request;
    const res = createRes();

    await GET(req, res);

    expect(resolveApplicationFromRequest).toHaveBeenCalledWith(req);
    expect(signState).toHaveBeenCalledWith('michael.iworkhere.com');
    expect(res.statusCode).toBe(302);
  });
});
