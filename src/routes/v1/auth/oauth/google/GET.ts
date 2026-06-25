/**
 * @file GET.ts
 * @external Google OAuth 2.0
 * @module routes/v1/auth/oauth/google
 * @tag auth, oauth, google
 * @version 1.2.0
 * @path /v1/auth/oauth/google
 * @author william.r.oak@gmail.com
 * @summary Initiates the Google OAuth 2.0 authorization flow.
 * @description
 * Redirects the user agent to Google s OAuth 2.0 authorization endpoint. 
 * Detects the calling application context, signs the state (optionally 
 * including a custom redirect_uri and flow intent for mobile deep 
 * linking or web popups), and builds the final authorization URL.
 *
 * @query
 * {
 *   "redirect_uri": {
 *     "type": "string",
 *     "required": false,
 *     "description": "Optional custom URI to redirect back to after success (e.g. mobile deep link)."
 *   },
 *   "flow": {
 *     "type": "string",
 *     "required": false,
 *     "enum": ["popup", "redirect"],
 *     "description": "Optional flow override. Defaults to redirect."
 *   },
 *   "app_key": {
 *     "type": "string",
 *     "required": false,
 *     "description": "Explicit application key for resolution."
 *   }
 * }
 *
 * @requestExample none
 * @response 
 * {
 *   "redirect": "https://accounts.google.com/o/oauth2/v2/auth"
 * }
 * @requires {
 *   "env": ["GOOGLE_AUTHORIZATION_URL", "GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_REDIRECT_URI"],
 *   "services": ["@services/auth/applicationOriginResolver", "@services/auth/oauthStateService"]
 * }
 */

import type { Request, Response } from "express";
import { config } from "@helpers/config";
import { getGoogleOAuthConfig } from "@helpers/config";
import { resolveApplicationFromRequest, getCallerOrigin } from "@services/auth/applicationOriginResolver";
import { signState } from "@services/auth/oauthStateService";

/**
 * GET /v1/auth/oauth/google
 *
 * Starts the Google OAuth login flow.
 */
export default async function GET(req: Request, res: Response): Promise<void> {
  const googleConfig = getGoogleOAuthConfig();
  let { redirect_uri, flow } = req.query;

  // Resolve application from origin/refer/query for multi-consumer support
  const appCtx = await resolveApplicationFromRequest(req);
  console.log('[DEBUG] [oauth/google/GET] initiation', {
      query: req.query,
      appKey: appCtx.applicationKey
  });

  if (!redirect_uri) {
      try {
          const origin = getCallerOrigin(req);
          if (origin) {
              redirect_uri = origin;
          } else if (config['APP_URL']) {
              redirect_uri = config['APP_URL'] as string;
          }
      } catch (err) {
          console.warn('[GET] Failed to resolve origin for redirect_uri, falling back to APP_URL', err);
          if (config['APP_URL']) {
            redirect_uri = config['APP_URL'] as string;
          }
      }
  }

  // Force cast flow to ensure it matches the StatePayload type
  const flowType = flow === "popup" ? "popup" : "redirect";

  // Sign the app_key (and optional redirect_uri/flow) into the state for callback recovery
  if (typeof redirect_uri === "string" && redirect_uri.startsWith("/")) {
    const origin = getCallerOrigin(req) ?? config['APP_URL'] as string ?? '';
    if (origin) {
        const base = origin.endsWith("/") ? origin.slice(0, -1) : origin;
        redirect_uri = base + redirect_uri;
    }
  }

  console.log('[DEBUG] [oauth/google/GET] Before state signing', { redirect_uri, flowType });
  const state = signState(
      appCtx.applicationKey,
      typeof redirect_uri === "string" ? redirect_uri : undefined,
      flowType
  );
  console.log('[DEBUG] [oauth/google/GET] state signed', { state });

  const authorizationUrl = new URL(googleConfig.authorizationUrl);

  authorizationUrl.searchParams.set("client_id", googleConfig.clientId);
  authorizationUrl.searchParams.set("redirect_uri", googleConfig.redirectUri);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("scope", "openid email profile");
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("access_type", "offline");
  authorizationUrl.searchParams.set("prompt", "consent");

  res.redirect(302, authorizationUrl.toString());
}

