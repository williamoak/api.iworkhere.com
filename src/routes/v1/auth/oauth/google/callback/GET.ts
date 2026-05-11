/**
 * @file GET.ts
 * @external Google OAuth 2.0
 * @module routes/v1/auth/oauth/google/callback
 * @tag auth, oauth, google
 * @version 1.2.3
 * @path /v1/auth/oauth/google/callback
 * @author william.r.oak@gmail.com
 * @summary Handles the Google OAuth 2.0 callback and performs multi-platform redirection.
 * @description controls the oAuth process callback from google to bill.iworkhere.com
 */

import type { Request, Response } from "express";
import crypto from "crypto";
import { and, eq } from "drizzle-orm";

import { getGoogleOAuthConfig } from "@helpers/config";
import { verifyState } from "@services/auth/oauthStateService";
import { resolveAuthContext } from "@services/auth/authContext";
import { issueLoginTokens } from "@services/auth/tokenService";
import { db } from "@services/dbService";
import { users, userAuthOauth } from "@db/schema";

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

  if (error || typeof code !== "string" || typeof state !== "string") {
    res.redirect(302, googleConfig.failureRedirectUrl);
    return;
  }

  try {
    const statePayload = verifyState(state);
    const appCtx = await resolveAuthContext({ app_key: statePayload.app_key });

    const tokenResponse = await fetch(googleConfig.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: googleConfig.clientId,
        client_secret: googleConfig.clientSecret,
        redirect_uri: googleConfig.redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });

    const tokenJson = (await tokenResponse.json()) as GoogleTokenResponse;
    if (!tokenResponse.ok || !tokenJson.access_token) {
      res.redirect(302, googleConfig.failureRedirectUrl);
      return;
    }

    const userinfoResponse = await fetch(googleConfig.userInfoUrl, {
      headers: { authorization: `Bearer ${tokenJson.access_token}` },
    });
    const googleUser = (await userinfoResponse.json()) as GoogleUserInfo;

    let userRow = await db.query.userAuthOauth.findFirst({
      where: and(
        eq(userAuthOauth.provider, "google"),
        eq(userAuthOauth.providerAccountId, googleUser.sub),
      ),
    });

    if (!userRow) {
      let existingUser = googleUser.email
        ? await db.query.users.findFirst({
            where: eq(users.email, googleUser.email),
          })
        : undefined;

      if (!existingUser) {
        const newUser = await db
          .insert(users)
          .values({
            id: crypto.randomUUID(),
            username: googleUser.email ?? `google_${googleUser.sub}`,
            email: googleUser.email,
            statusCode: "active",
          })
          .returning();
        existingUser = newUser[0];
      }

      userRow = await db
        .insert(userAuthOauth)
        .values({
          id: crypto.randomUUID(),
          userId: existingUser.id,
          provider: "google",
          providerAccountId: googleUser.sub,
          email: googleUser.email,
        })
        .returning()
        .then((r) => r[0]);
    }

    if (!userRow) {
        throw new Error("Failed to resolve or create user");
    }

    const tokens = await issueLoginTokens(userRow.userId, appCtx.applicationId);

    // --- ENHANCED SWITCHBOARD LOGIC ---

    // 1. Detect if the receiver is a Native/Mobile app (Uses a deep link scheme like exp:// or billapp://)
    const isDeepLink = statePayload.redirect_uri?.includes("://") || statePayload.redirect_uri?.includes("--/");

    // 2. Web Popup Flow (ONLY if not a deep link and flow is set to popup)
    if (statePayload.flow === "popup" && !isDeepLink) {
        res.status(200).send(`
            <!DOCTYPE html>
            <html>
            <head><title>Authenticated</title></head>
            <body style="background: #f0fff4; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; font-family: sans-serif;">
                <script>
                    const data = {
                        access_token: "${tokens.access.token}",
                        refresh_token: "${tokens.refresh.token}"
                    };
                    
                    try {
                        // Attempt postMessage to parent window (most reliable method)
                        if (window.opener && window.opener !== null) {
                            window.opener.postMessage({ type: "OAUTH_SUCCESS", data }, "*");
                            setTimeout(() => window.close(), 200);
                        } else {
                            // Fallback 1: Use localStorage bridge + notify via storage event
                            // Parent window listens for 'oauth-tokens' item changes
                            try {
                                const storageKey = "oauth-tokens";
                                localStorage.setItem(storageKey, JSON.stringify(data));
                                // Also set a timestamp to ensure storage event fires
                                localStorage.setItem("oauth-tokens-updated", String(Date.now()));
                            } catch (e) {
                                console.error("[oauth-callback] localStorage failed:", e);
                            }
                            
                            // Fallback 2: If localStorage fails, auto-close and notify via delayed redirect
                            // (Parent should have already handled via postMessage or storage listener)
                            setTimeout(() => window.close(), 1000);
                        }
                    } catch (error) {
                        console.error("[oauth-popup] error:", error);
                        // Last resort: redirect to app with tokens in URL
                        window.location.href = "https://bill.iworkhere.com/?oauth_token=" + encodeURIComponent(JSON.stringify(data));
                    }
                </script>
                <div style="text-align: center; border: 2px solid blue; padding: 20px; background: white; border-radius: 10px; font-family: sans-serif;">
                    <h2>Login Successful</h2>
                    <p>Closing this window...</p>
                </div>
            </body>
            </html>
        `);
        return;
    }

    // 3. Mobile/Native or Standard Redirect Flow
    if (statePayload.redirect_uri) {
        const redirectUrl = new URL(statePayload.redirect_uri);
        redirectUrl.searchParams.set("access_token", tokens.access.token);
        redirectUrl.searchParams.set("refresh_token", tokens.refresh.token);
        res.redirect(302, redirectUrl.toString());
        return;
    }

    // 4. Default JSON Response (Web API fallback)
    res.status(200).json({
      user: {
        id: userRow.userId,
        username: googleUser.email,
        email: googleUser.email,
        status: "active",
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
  } catch (err) {
    console.error("[oauth-callback] error:", err);
    res.status(500).send("Authentication Error");
  }
}
