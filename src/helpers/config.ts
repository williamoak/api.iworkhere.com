/**
 * @myDocBlock v2.1
 * @file /src/helpers/config.ts
 * @internal
 * @module Config
 * @tag helpers
 * @version 1.0.2
 * @path none
 * @summary Centralized environment configuration loader and accessor.
 * @description
 *   Loads and merges .env files using layered precedence:
 *     1. .env
 *     2. .env.local
 *     3. .env.{NODE_ENV}
 *     4. .env.{NODE_ENV}.local
 *
 *   Later files override earlier ones. Finally, process.env overrides
 *   everything. This file MUST be imported before any modules that rely on env.
 * @requestExample none
 * @response [none]
 * @requires [none]
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

/**
 * Get required numeric variable
 */
export function configGetNumber(
  key: string,
  options?: {
    defaultValue?: number;
    min?: number;
    max?: number;
  },
): number {
  const raw = config[key];

  if (raw === undefined || raw.trim() === '') {
    if (options?.defaultValue !== undefined) {
      return options.defaultValue;
    }
    throw new Error(`Missing required numeric configuration variable: ${key}`);
  }

  const value = Number(raw);

  if (!Number.isFinite(value)) {
    throw new Error(`Invalid numeric value for configuration variable: ${key}`);
  }

  if (options?.min !== undefined && value < options.min) {
    throw new Error(`Configuration variable ${key} must be >= ${options.min}`);
  }

  if (options?.max !== undefined && value > options.max) {
    throw new Error(`Configuration variable ${key} must be <= ${options.max}`);
  }

  return value;
}

/**
 * Determine environment (default "development")
 */
const env = process.env.NODE_ENV ?? 'development';

/**
 * Env file precedence order
 */
const envFiles = ['.env', '.env.local', `.env.${env}`, `.env.${env}.local`];

// When running tests, many projects keep credentials/config in .env.development.
// To make tests more forgiving when NODE_ENV is 'test', also attempt to load
// `.env.development` as a fallback so values defined there are available.
if (env === 'test') {
  envFiles.push('.env.development');
}

/**
 * Project root
 */
const projectRoot = path.resolve(process.cwd());

/**
 * Merged values
 */
let combined: Record<string, string | undefined> = {};

/**
 * Load each env file (if it exists)
 */
for (const file of envFiles) {
  const fullPath = path.join(projectRoot, file);

  if (fs.existsSync(fullPath)) {
    const result = dotenv.config({ path: fullPath });

    if (result.parsed) {
      combined = { ...combined, ...result.parsed };
    }
  }
}

/**
 * Merge actual runtime process.env last
 */
combined = { ...combined, ...process.env };

/**
 * Export configuration object
 */
export const config = combined;

/**
 * Get required variable
 */
export function configGet(key: string): string {
  const value = config[key];

  if (value === undefined || value.trim() === '') {
    throw new Error(`Missing required configuration variable: ${key}`);
  }

  return value;
}

/**
 * Get Google OAuth configuration.
 */
export function getGoogleOAuthConfig() {
  return {
    clientId: configGet('GOOGLE_OAUTH_CLIENT_ID'),
    clientSecret: configGet('GOOGLE_OAUTH_CLIENT_SECRET'),
    redirectUri: configGet('GOOGLE_OAUTH_REDIRECT_URI'),
    authorizationUrl: configGet('GOOGLE_AUTHORIZATION_URL'),
    tokenUrl: configGet('GOOGLE_TOKEN_URL'),
    userInfoUrl: configGet('GOOGLE_USERINFO_URL'),
    stateSecret: configGet('OAUTH_STATE_SECRET'),
    successRedirectUrl: configGet('GOOGLE_OAUTH_SUCCESS_REDIRECT_URL'),
    failureRedirectUrl: configGet('GOOGLE_OAUTH_FAILURE_REDIRECT_URL'),
  };
}

/**
 * WebAuthn server configuration. Ceremony signing is deployment-wide; trusted
 * origins and RP IDs are resolved from the selected application at runtime.
 */
export function getWebAuthnConfig() {
  return {
    // Kept as an optional compatibility fallback for direct service callers;
    // HTTP routes must resolve the RP ID from application_origins.
    rpId: config.WEBAUTHN_RP_ID?.trim() || undefined,
    rpName: config.WEBAUTHN_RP_NAME?.trim() || 'iworkhere',
    ceremonyTtlSeconds: configGetNumber('WEBAUTHN_CEREMONY_TTL_SECONDS', {
      defaultValue: 300,
      min: 30,
      max: 900,
    }),
    signingSecret: configGet('WEBAUTHN_CEREMONY_SECRET'),
    previousSigningSecret: config.WEBAUTHN_PREVIOUS_CEREMONY_SECRET?.trim() || undefined,
  };
}