import { describe, expect, it, vi } from 'vitest';

const { consumeOnce } = vi.hoisted(() => ({
  consumeOnce: vi.fn().mockResolvedValue(true),
}));

vi.mock('@helpers/config', () => ({
  getWebAuthnConfig: vi.fn(() => ({
    rpId: 'joinaunion.iworkhere.com',
    rpName: 'JoinAUnion',
    origins: ['https://joinaunion.iworkhere.com'],
    ceremonyTtlSeconds: 300,
    signingSecret: 'test-signing-secret-that-is-long-enough',
    previousSigningSecret: undefined,
  })),
}));

vi.mock('@cache/cacheStore', () => ({
  cacheStore: { consumeOnce },
}));

import { consumeCeremony, createCeremony } from '@services/auth/ceremonyService';

describe('ceremonyService', () => {
  it('binds a signed ceremony to the operation, application, origin, and user', async () => {
    const created = createCeremony({
      operation: 'registration',
      applicationId: 'app-id',
      applicationKey: 'joinaunion.iworkhere.com',
      userId: 'user-id',
      origin: 'https://joinaunion.iworkhere.com',
    });

    const consumed = await consumeCeremony(created.token, {
      operation: 'registration',
      applicationId: 'app-id',
      userId: 'user-id',
    });

    expect(consumed.challenge).toBe(created.payload.challenge);
    expect(consumed.jti).toBe(created.payload.jti);
    expect(consumeOnce).toHaveBeenCalledWith(expect.stringContaining(`webauthn:ceremony:${created.payload.jti}`), expect.any(Number));
  });

  it('rejects a tampered or incorrectly bound ceremony', async () => {
    const created = createCeremony({
      operation: 'authentication',
      applicationId: 'app-id',
      applicationKey: 'joinaunion.iworkhere.com',
      origin: 'https://joinaunion.iworkhere.com',
    });

    await expect(consumeCeremony(`${created.token}x`)).rejects.toMatchObject({ code: 'INVALID_PASSKEY_CEREMONY' });
    await expect(consumeCeremony(created.token, { applicationId: 'other-app' })).rejects.toMatchObject({ code: 'INVALID_PASSKEY_CEREMONY' });
  });

  it('rejects a ceremony whose replay marker was already claimed', async () => {
    consumeOnce.mockResolvedValueOnce(false);
    const created = createCeremony({
      operation: 'authentication',
      applicationId: 'app-id',
      applicationKey: 'joinaunion.iworkhere.com',
      origin: 'https://joinaunion.iworkhere.com',
    });

    await expect(consumeCeremony(created.token)).rejects.toMatchObject({ code: 'INVALID_PASSKEY_CEREMONY' });
  });
});
