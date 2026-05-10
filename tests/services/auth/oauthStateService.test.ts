import { describe, expect, it, vi } from 'vitest';

vi.mock('@helpers/config', () => ({
  getGoogleOAuthConfig: vi.fn(() => ({
    stateSecret: 'test-secret-12345678901234567890123456789012',
  })),
}));

import { signState, verifyState } from '@services/auth/oauthStateService';

describe('oauthStateService', () => {
  it('signs and verifies state without redirect_uri', () => {
    const appKey = 'bill.iworkhere.com';
    const state = signState(appKey);
    
    expect(state).toBeTypeOf('string');
    expect(state.split('.')).toHaveLength(2);

    const payload = verifyState(state);
    expect(payload.app_key).toBe(appKey);
    expect(payload.nonce).toBeTypeOf('string');
    expect(payload.redirect_uri).toBeUndefined();
  });

  it('signs and verifies state with redirect_uri', () => {
    const appKey = 'michael.iworkhere.com';
    const redirectUri = 'michaelapp://auth';
    const state = signState(appKey, redirectUri);
    
    const payload = verifyState(state);
    expect(payload.app_key).toBe(appKey);
    expect(payload.redirect_uri).toBe(redirectUri);
  });

  it('throws on invalid state format', () => {
    expect(() => verifyState('invalid-state')).toThrow('Invalid state format');
  });

  it('throws on invalid signature', () => {
    const state = signState('app-1');
    const [payload, signature] = state.split('.');
    const tamperedState = payload + '.tampered-' + signature;
    
    expect(() => verifyState(tamperedState)).toThrow('Invalid state signature');
  });
});
