/**
 * @myDocBlock v2.3
 * @file GET.ts
 * @external
 * @module routes/v1/auth/oauth/google/callback
 * @tag auth, oauth, google
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path /v1/auth/oauth/google/callback
 * @summary Handle the Google OAuth callback.
 * @description
 * Handles Google's OAuth 2.0 callback after the user approves or denies access.
 * The implementation verifies the signed state to recover the application context,
 * exchanges the authorization code for Google tokens, loads the Google profile,
 * links/creates the local user, issues application tokens, and returns the
 * authentication response.
 * @query
 * {
 *   "code": {
 *     "type": "string",
 *     "required": false,
 *     "description": "Authorization code returned by Google after successful consent."
 *   },
 *   "state": {
 *     "type": "string",
 *     "required": false,
 *     "description": "Signed anti-forgery state value containing application context."
 *   },
 *   "error": {
 *     "type": "string",
 *     "required": false,
 *     "description": "OAuth error code returned by Google when authorization fails."
 *   }
 * }
 * @requestExample none
 * @response
 * {
 *   "user": { "id": "uuid", "username": "...", "email": "...", "status": "active" },
 *   "application": { "id": "uuid", "app_key": "..." },
 *   "tokens": {
 *     "access": { "token": "opaque", "expires_at": "ISO-8601" },
 *     "refresh": { "token": "opaque", "expires_at": "ISO-8601" }
 *   }
 * }
 * @requires
 * {
 *   "environment": [
 *     "GOOGLE_OAUTH_CLIENT_ID",
 *     "GOOGLE_OAUTH_CLIENT_SECRET",
 *     "GOOGLE_OAUTH_REDIRECT_URI",
 *     "GOOGLE_TOKEN_URL",
 *     "GOOGLE_USERINFO_URL",
 *     "GOOGLE_OAUTH_SUCCESS_REDIRECT_URL",
 *     "GOOGLE_OAUTH_FAILURE_REDIRECT_URL",
 *     "OAUTH_STATE_SECRET"
 *   ],
 *   "databaseTables": [
 *     "users",
 *     "user_auth_oauth",
 *     "auth_tokens"
 *   ],
 *   "externalServices": [
 *     "Google OAuth 2.0 token endpoint",
 *     "Google OpenID Connect userinfo endpoint"
 *   ]
 * }
 */

import type { Request, Response } from 'express';
import crypto from 'crypto';
import { and, eq } from 'drizzle-orm';

import { getGoogleOAuthConfig } from '@helpers/config';
import { verifyState } from '@services/auth/oauthStateService';
import { resolveAuthContext } from '@services/auth/authContext';
import { issueLoginTokens } from '@services/auth/tokenService';
import { db } from '@services/dbService';
import { users, userAuthOauth } from '@db/schema';

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
};

type GoogleUserInfo = {
  sub: string;
  email?: string;
};

export default async function GET(req: Request, res: Response): Promise<void> {
  const googleConfig = getGoogleOAuthConfig();
  const { code, state, error } = req.query;

  if (error || typeof code !== 'string' || typeof state !== 'string') {
    res.redirect(302, googleConfig.failureRedirectUrl);
    return;
  }

  // 1. Verify state and recover app key
  const statePayload = verifyState(state);
  const appCtx = await resolveAuthContext({ app_key: statePayload.app_key });

  // 2. Exchange code for tokens
  const tokenResponse = await fetch(googleConfig.tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: googleConfig.clientId,
      client_secret: googleConfig.clientSecret,
      redirect_uri: googleConfig.redirectUri,
      grant_type: 'authorization_code',
    }).toString(),
  });

  const tokenJson = (await tokenResponse.json()) as GoogleTokenResponse;

  if (!tokenResponse.ok || !tokenJson.access_token) {
    res.redirect(302, googleConfig.failureRedirectUrl);
    return;
  }

  // 3. Fetch Google Profile
  const userinfoResponse = await fetch(googleConfig.userInfoUrl, {
    headers: { authorization: `Bearer ${tokenJson.access_token}` },
  });
  const googleUser = (await userinfoResponse.json()) as GoogleUserInfo;

  // 4. Find or Create User (Account Linking)
  let userRow = await db.query.userAuthOauth.findFirst({
    where: and(
      eq(userAuthOauth.provider, 'google'),
      eq(userAuthOauth.providerAccountId, googleUser.sub),
    ),
  });

  if (!userRow) {
    // If no existing link, see if user exists by email
    let existingUser = googleUser.email
      ? await db.query.users.findFirst({
          where: eq(users.email, googleUser.email),
        })
      : undefined;

    if (!existingUser) {
      // Create new user if not found by email
      const newUser = await db
        .insert(users)
        .values({
          id: crypto.randomUUID(),
          username: googleUser.email ?? `google_${googleUser.sub}`,
          email: googleUser.email,
          statusCode: 'active',
        })
        .returning();
      existingUser = newUser[0];
    }

    // Link Google account to (new or existing) user
    userRow = await db
      .insert(userAuthOauth)
      .values({
        id: crypto.randomUUID(),
        userId: existingUser.id,
        provider: 'google',
        providerAccountId: googleUser.sub,
        email: googleUser.email,
      })
      .returning()
      .then((r) => r[0]);
  }

  if (!userRow) {
    throw new Error('Failed to resolve or create user');
  }

  // 5. Issue Tokens
  const tokens = await issueLoginTokens(userRow.userId, appCtx.applicationId);

  // 6. Respond
  res.status(200).json({
    user: {
      id: userRow.userId,
      username: googleUser.email,
      email: googleUser.email,
      status: 'active',
    },
    application: { id: appCtx.applicationId, app_key: appCtx.applicationKey },
    tokens: {
      access: {
        token: tokens.access.token,
        expires_at: tokens.access.expiresAt.toISOString(),
      },
      refresh: {
        token: tokens.refresh.token,
        expires_at: tokens.refresh.expiresAt.toISOString(),
      },
    },
  });
}
