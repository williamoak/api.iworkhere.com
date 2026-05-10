import crypto from 'crypto';
import { getGoogleOAuthConfig } from '@helpers/config';

export type StatePayload = {
  app_key: string;
  nonce: string;
  redirect_uri?: string;
  flow?: 'popup' | 'redirect';
};

export function signState(appKey: string, redirectUri?: string, flow: 'popup' | 'redirect' = 'redirect'): string {
  const config = getGoogleOAuthConfig();
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload: StatePayload = { app_key: appKey, nonce, redirect_uri: redirectUri, flow };
  const payloadString = JSON.stringify(payload);

  const signature = crypto
    .createHmac('sha256', config.stateSecret)
    .update(payloadString)
    .digest('hex');

  return `${Buffer.from(payloadString).toString('base64url')}.${signature}`;
}

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
