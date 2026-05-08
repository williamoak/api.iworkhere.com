/**
 * @myDocBlock
 * @file oauthStateService.ts
 * @internal
 * @module services/auth
 * @tag auth, oauth, state, security
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path src/services/auth/oauthStateService.ts
 * @summary Signs and verifies OAuth state parameters.
 * @description
 * Generates signed state strings containing an app_key and a nonce,
 * preventing CSRF and ensuring the application context persists across
 * the Google OAuth redirect.
 *
 * @requires
 * {
 *   "helpers": ["@helpers/config"],
 *   "libraries": ["crypto"]
 * }
 */

import crypto from 'crypto';
import { getGoogleOAuthConfig } from '@helpers/config';

type StatePayload = {
  app_key: string;
  nonce: string;
};

/**
 * Sign a state object.
 */
export function signState(appKey: string): string {
  const config = getGoogleOAuthConfig();
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload: StatePayload = { app_key: appKey, nonce };
  const payloadString = JSON.stringify(payload);

  const signature = crypto
    .createHmac('sha256', config.stateSecret)
    .update(payloadString)
    .digest('hex');

  return `${Buffer.from(payloadString).toString('base64url')}.${signature}`;
}

/**
 * Verify a signed state string and recover the payload.
 */
export function verifyState(state: string): StatePayload {
  const config = getGoogleOAuthConfig();
  const [encodedPayload, signature] = state.split('.');

  if (!encodedPayload || !signature) {
    throw new Error('Invalid state format');
  }

  const payloadString = Buffer.from(encodedPayload, 'base64url').toString();
  const expectedSignature = crypto
    .createHmac('sha256', config.stateSecret)
    .update(payloadString)
    .digest('hex');

  if (signature !== expectedSignature) {
    throw new Error('Invalid state signature');
  }

  return JSON.parse(payloadString) as StatePayload;
}

