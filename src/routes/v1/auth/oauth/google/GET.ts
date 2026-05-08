/**
 * @myDocBlock v2.3
 * @file GET.ts
 * @external
 * @module routes/v1/auth/oauth/google
 * @tag auth, oauth, google
 * @version 1.1.0
 * @author william.r.oak@gmail.com
 * @path /v1/auth/oauth/google
 * @summary Start the Google OAuth login flow.
 * @description
 * Redirects the user agent to Google's OAuth 2.0 authorization endpoint.
 * Detects the calling application context, signs the state with the app_key,
 * and builds the authorization URL.
 * @requestExample none
 * @response
 * {
 *   "redirect": "https://accounts.google.com/o/oauth2/v2/auth"
 * }
 * @requires
 * {
 *   "environment": [
 *     "GOOGLE_AUTHORIZATION_URL",
 *     "GOOGLE_OAUTH_CLIENT_ID",
 *     "GOOGLE_OAUTH_REDIRECT_URI"
 *   ],
 *   "externalServices": [
 *     "Google OAuth 2.0 authorization en7dpoint"
 *   ]
 * }
 */

import type { Request, Response } from 'express';
import { getGoogleOAuthConfig } from '@helpers/config';
import { resolveApplicationFromRequest } from '@services/auth/applicationOriginResolver';
import { signState } from '@services/auth/oauthStateService';

/**
 * GET /v1/auth/oauth/google
 *
 * Starts the Google OAuth login flow.
 */
export default async function GET(req: Request, res: Response): Promise<void> {
  const googleConfig = getGoogleOAuthConfig();

  // Resolve application from origin/refer/query for multi-consumer support
  const appCtx = await resolveApplicationFromRequest(req);

  // Sign the app_key into the state for callback recovery
  const state = signState(appCtx.applicationKey);

  const authorizationUrl = new URL(googleConfig.authorizationUrl);

  authorizationUrl.searchParams.set('client_id', googleConfig.clientId);
  authorizationUrl.searchParams.set('redirect_uri', googleConfig.redirectUri);
  authorizationUrl.searchParams.set('response_type', 'code');
  authorizationUrl.searchParams.set('scope', 'openid email profile');
  authorizationUrl.searchParams.set('state', state);
  authorizationUrl.searchParams.set('access_type', 'offline');
  authorizationUrl.searchParams.set('prompt', 'consent');

  res.redirect(302, authorizationUrl.toString());
}
