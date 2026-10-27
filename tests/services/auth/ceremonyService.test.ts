import crypto from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const SIGNING_SECRET = 'test-signing-secret-that-is-long-enough';

const { insert, values, onConflictDoNothing, returning } = vi.hoisted(() => {
  const returning = vi.fn();
  const onConflictDoNothing = vi.fn(() => ({ returning }));
  const values = vi.fn(() => ({ onConflictDoNothing }));
  const insert = vi.fn(() => ({ values }));
  return { insert, values, onConflictDoNothing, returning };
});

vi.mock('@helpers/config', () => ({
  getWebAuthnConfig: vi.fn(() => ({
    rpId: 'joinaunion-dev.iworkhere.com',
    rpName: 'JoinAUnion',
    origins: ['https://joinaunion-dev.iworkhere.com'],
    ceremonyTtlSeconds: 300,
    signingSecret: 'test-signing-secret-that-is-long-enough',
    previousSigningSecret: undefined,
  })),
}));

vi.mock('@services/dbService', () => ({
  db: { insert },
}));

vi.mock('@db/schema', () => ({
  consumedWebauthnCeremonies: { jti: 'jti-column' },
}));

// Every access to the Redis-backed cache throws, simulating a Redis outage or restart.
vi.mock('@cache/cacheStore', () => ({
  cacheStore: new Proxy({}, {
    get() {
      throw new Error('Redis unavailable');
    },
  }),
}));

import { consumeCeremony, createCeremony } from '@services/auth/ceremonyService';

/** Signs an arbitrary payload the same way createCeremony() does. */
function signPayload(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', SIGNING_SECRET).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function createAuthenticationCeremony() {
  return createCeremony({
    operation: 'authentication',
    applicationId: 'app-id',
    applicationKey: 'joinaunion-dev.iworkhere.com',
    origin: 'https://joinaunion-dev.iworkhere.com',
  });
}

describe('ceremonyService', () => {
  beforeEach(() => {
    // Default: this call wins the claim.
    returning.mockResolvedValue([{ jti: 'claimed' }]);
  });

  it('binds a signed ceremony to the operation, application, origin, and user', async () => {
    const created = createCeremony({
      operation: 'registration',
      applicationId: 'app-id',
      applicationKey: 'joinaunion-dev.iworkhere.com',
      userId: 'user-id',
      origin: 'https://joinaunion-dev.iworkhere.com',
    });

    const consumed = await consumeCeremony(created.token, {
      operation: 'registration',
      applicationId: 'app-id',
      userId: 'user-id',
    });

    expect(consumed.challenge).toBe(created.payload.challenge);
    expect(consumed.jti).toBe(created.payload.jti);
  });

  it('claims the signed jti with the signed expiry, using an insert that ignores conflicts', async () => {
    const created = createAuthenticationCeremony();

    await consumeCeremony(created.token);

    expect(insert).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledWith({
      jti: created.payload.jti,
      expiresAt: new Date(created.payload.expiresAt * 1000),
    });
    expect(onConflictDoNothing).toHaveBeenCalledWith({ target: expect.anything() });
    expect(returning).toHaveBeenCalledTimes(1);
  });

  it('rejects a tampered or incorrectly bound ceremony before claiming it', async () => {
    const created = createAuthenticationCeremony();

    await expect(consumeCeremony(`${created.token}x`)).rejects.toMatchObject({ code: 'INVALID_PASSKEY_CEREMONY' });
    await expect(consumeCeremony(created.token, { applicationId: 'other-app' })).rejects.toMatchObject({ code: 'INVALID_PASSKEY_CEREMONY' });

    expect(insert).not.toHaveBeenCalled();
  });

  it('consumes and replay-checks ceremonies while Redis is unavailable', async () => {
    const created = createAuthenticationCeremony();

    await expect(consumeCeremony(created.token)).resolves.toMatchObject({ jti: created.payload.jti });
    expect(insert).toHaveBeenCalledTimes(1);

    returning.mockResolvedValueOnce([]);
    await expect(consumeCeremony(created.token)).rejects.toMatchObject({ code: 'INVALID_PASSKEY_CEREMONY' });
  });

  it('rejects a ceremony whose jti was already consumed', async () => {
    returning.mockResolvedValueOnce([]);
    const created = createAuthenticationCeremony();

    await expect(consumeCeremony(created.token)).rejects.toMatchObject({ code: 'INVALID_PASSKEY_CEREMONY' });
  });

  it('fails closed when the claim cannot be written, and does not return the payload', async () => {
    returning.mockRejectedValueOnce(new Error('connection refused'));
    const created = createAuthenticationCeremony();

    // The database error propagates, so the ceremony is not accepted.
    await expect(consumeCeremony(created.token)).rejects.toThrow('connection refused');
  });

  it('rejects a correctly signed ceremony whose jti is not a UUID', async () => {
    const token = signPayload({
      jti: 'not-a-uuid',
      operation: 'authentication',
      applicationId: 'app-id',
      applicationKey: 'joinaunion-dev.iworkhere.com',
      rpId: 'joinaunion-dev.iworkhere.com',
      origin: 'https://joinaunion-dev.iworkhere.com',
      challenge: crypto.randomBytes(32).toString('base64url'),
      issuedAt: Math.floor(Date.now() / 1000),
      expiresAt: Math.floor(Date.now() / 1000) + 300,
    });

    await expect(consumeCeremony(token)).rejects.toMatchObject({ code: 'INVALID_PASSKEY_CEREMONY' });
    expect(insert).not.toHaveBeenCalled();
  });
});
