import { logger } from '@helpers/logger';

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
import { isRegisteredWebRedirectUri } from "@services/auth/applicationOriginResolver";
import { issueLoginTokens } from "@services/auth/tokenService";
import { db } from "@services/dbService";
import { users, userApplications, userAuthOauth } from "@db/schema";

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
    if (
      statePayload.redirect_uri &&
      !(await isRegisteredWebRedirectUri(
        appCtx.applicationId,
        statePayload.redirect_uri,
      ))
    ) {
      res.status(400).send('Invalid OAuth redirect URI');
      return;
    }

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

    // OAuth users may have been created before application membership was
    // enforced for every authentication method. Ensure the application-scoped
    // access row exists before issuing an application-scoped token.
    await db
      .insert(userApplications)
      .values({
        userId: userRow.userId,
        applicationId: appCtx.applicationId,
        role: "user",
        isEnabled: true,
      })
      .onConflictDoNothing({
        target: [userApplications.userId, userApplications.applicationId],
      });

    const tokens = await issueLoginTokens(userRow.userId, appCtx.applicationId);
    res.locals.visitUserId = userRow.userId; // Set for logging middleware

    if (statePayload.flow === "popup") {
        res.cookie('auth_token', tokens.access.token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          maxAge: tokens.access.expiresAt.getTime() - Date.now(),
          path: '/',
          domain: '.iworkhere.com',
        });
        if (!statePayload.redirect_uri) {
            throw new Error("Missing redirect_uri for popup flow");
        }
        const targetOrigin = new URL(statePayload.redirect_uri).origin;
        const popupPayload = JSON.stringify({
          access_token: tokens.access.token,
          refresh_token: tokens.refresh.token,
        }).replace(/</g, '\\u003c');
        const popupOrigin = JSON.stringify(targetOrigin);

        res.status(200).send(`
            <!DOCTYPE html>
            <html>
            <head><title>Authenticated</title></head>
            <body>
                <script>
                    const data = ${popupPayload};
                    try {
                        if (!window.opener) throw new Error("OAuth popup has no opener");
                        window.opener.postMessage({ type: "OAUTH_SUCCESS", data }, ${popupOrigin});
                        setTimeout(() => window.close(), 1000);
                    } catch (error) {
                        console.error("OAuth popup handoff failed");
                    }
                </script>
                <div style="text-align: center; font-family: sans-serif; margin-top: 50px;">
                    <h2>Login Successful</h2>
                    <p>Closing this window...</p>
                </div>
            </body>
            </html>
        `);
        return;
    }

    if (statePayload.redirect_uri) {
        const redirectUrl = new URL(statePayload.redirect_uri);

        res.cookie('auth_token', tokens.access.token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          maxAge: tokens.access.expiresAt.getTime() - Date.now(),
          path: '/',
          domain: '.iworkhere.com',
        });

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

    logger.error("[oauth-callback] error:", err);
    res.status(500).send("Authentication Error");
  }
}
