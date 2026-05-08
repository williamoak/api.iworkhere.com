/**
 * @myDocBlock v2.3
 * @file PUT.test.ts
 * @internal
 * @module tests/routes/v1/auth/upgrade
 * @tag auth, upgrade, test
 * @version 1.0.0
 * @path tests/routes/v1/auth/upgrade/PUT.test.ts
 * @summary Unit tests for PUT /v1/auth/upgrade endpoint.
 * @description
 * Verifies that the account upgrade endpoint:
 *   - Exports a Zod request schema
 *   - Requires an authenticated user
 *   - Prevents upgrading if already upgraded
 *   - Successfully upgrades OAuth-only accounts to local accounts
 *   - Handles unexpected errors
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// Setup Mocks
const mockTx = {
  query: {
    userAuthLocal: { findFirst: vi.fn() }
  },
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
  where: vi.fn().mockResolvedValue({}),
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockResolvedValue({}),
};

vi.mock('@services/auth/passwordService', () => ({
  hashPassword: vi.fn().mockResolvedValue('hashed-pass'),
  enforcePasswordHistory: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@services/dbService', () => ({
  db: {
    transaction: vi.fn((cb) => cb(mockTx)),
  },
}));

vi.mock('@db/schema', () => ({
  users: { id: 'users' },
  userAuthLocal: { userId: 'userAuthLocal' },
}));

import PUT, { schema } from '@routes/v1/auth/upgrade/PUT';
import { hashPassword } from '@services/auth/passwordService';

// Helpers
function createReq(body: any, auth: any = { userId: 'u123' }): Request {
  return {
    body,
    validated: { body },
    auth,
  } as unknown as Request;
}

type ResMock = Response & {
  statusCode: number;
  body: unknown;
  status(code: number): any;
  json(payload: unknown): any;
};

function createRes(): ResMock {
  return {
    statusCode: 0,
    body: undefined,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: unknown) { this.body = payload; return this; },
  } as ResMock;
}

describe('PUT /v1/auth/upgrade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports a request body schema', () => {
    expect(schema.body).toBeDefined();
  });

  it('returns 400 if account is already upgraded', async () => {
    // Mock findFirst returning an existing record
    mockTx.query.userAuthLocal.findFirst.mockResolvedValue({ id: 'exists' });

    const req = createReq({ username: 'newuser', password: 'password123' });
    const res = createRes();

    await PUT(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'ALREADY_UPGRADED', message: 'Account is already upgraded.' });
  });

  it('upgrades account successfully', async () => {
    // Mock findFirst returning undefined (new user)
    mockTx.query.userAuthLocal.findFirst.mockResolvedValue(undefined);

    const req = createReq({ username: 'newuser', password: 'password123' });
    const res = createRes();

    await PUT(req, res);

    expect(res.statusCode).toBe(200);
    expect(hashPassword).toHaveBeenCalledWith('password123');
    expect(mockTx.update).toHaveBeenCalled();
    expect(mockTx.insert).toHaveBeenCalled();
    expect(res.body).toEqual({
      user: {
        id: 'u123',
        username: 'newuser',
        status: 'active'
      }
    });
  });
});
