/**
 * @myDocBlock
 * @file        PUT.ts
 * @module      auth.login
 * @version     1.0.0
 * @author      william.r.oak@gmail.com
 * @path        PUT /auth/login
 * @summary     Authenticate a user for an application and issue tokens
 * @description
 *  Authenticates a user using local credentials within the context of a
 *  specific application. On success, issues a short-lived access token
 *  and a rotatable refresh token scoped to the application.
 *
 *  Enforcement order (authoritative):
 *   1. Parse & validate input
 *   2. Resolve application
 *   3. Resolve user
 *   4. Enforce user status
 *   5. Enforce application access
 *   6. Verify password (local auth)
 *   7. Issue tokens (atomic)
 *
 * @query {}
 * @requestExample
 * {
 *   "app_key": "bill_web",
 *   "identifier": "user@example.com",
 *   "password": "plaintext-password"
 * }
 *
 * @requires
 *  - applications
 *  - users
 *  - user_auth_local
 *  - user_applications
 *  - auth_tokens
 */

import type { Request, Response } from "express";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";
import crypto from "crypto";

import { db } from "@services/dbService";
import { applications } from "@db/schema/applications";
import { users } from "@db/schema/users";
import { userAuthLocal } from "@db/schema/user_auth_local";
import { userApplications } from "@db/schema/user_applications";
import { authTokens } from "@db/schema/auth_tokens";

/**
 * Configuration (can be env-driven later)
 */
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes
const REFRESH_TOKEN_TTL_DAYS = 30;

type LoginRequestBody = {
    app_key?: unknown;
    identifier?: unknown;
    password?: unknown;
};

export default async function PUT(_req: Request, _res: Response) {

    /* -------------------------------------------------
     * Step 1 — Parse & validate input
     * ------------------------------------------------- */

    const body = (_req.body ?? {}) as LoginRequestBody;

    if (
        typeof body.app_key !== "string" ||
        typeof body.identifier !== "string" ||
        typeof body.password !== "string"
    ) {
        return { error: "invalid_request" };
    }

    const appKey = body.app_key.trim();
    const identifierRaw = body.identifier.trim();
    const password = body.password;

    if (!appKey || !identifierRaw || !password) {
        return { error: "invalid_request" };
    }

    const identifier =
        identifierRaw.includes("@")
            ? identifierRaw.toLowerCase()
            : identifierRaw;

    /* -------------------------------------------------
     * Step 2 — Resolve application
     * ------------------------------------------------- */

    const app = await db
        .select({
            id: applications.id,
            appKey: applications.appKey,
            isEnabled: applications.isEnabled,
        })
        .from(applications)
        .where(eq(applications.appKey, appKey))
        .limit(1)
        .then(r => r[0]);

    if (!app) {
        return { error: "invalid_credentials" };
    }

    if (!app.isEnabled) {
        return {
            error: "access_denied",
            reason: "application_disabled",
        };
    }

    /* -------------------------------------------------
     * Step 3 — Resolve user
     * ------------------------------------------------- */

    const user = await db
        .select({
            id: users.id,
            username: users.username,
            email: users.email,
            statusCode: users.statusCode,
        })
        .from(users)
        .where(
            identifier.includes("@")
                ? eq(users.email, identifier)
                : eq(users.username, identifier)
        )
        .limit(1)
        .then(r => r[0]);

    if (!user) {
        return { error: "invalid_credentials" };
    }

    /* -------------------------------------------------
     * Step 4 — User status gate
     * ------------------------------------------------- */

    if (user.statusCode !== "active") {
        if (user.statusCode === "disabled") {
            return {
                error: "access_denied",
                reason: "user_disabled",
            };
        }

        return {
            error: "account_locked",
            reason: "pending_or_unverified",
        };
    }

    /* -------------------------------------------------
     * Step 5 — Application access gate
     * ------------------------------------------------- */

    const access = await db
        .select({
            isEnabled: userApplications.isEnabled,
        })
        .from(userApplications)
        .where(
            and(
                eq(userApplications.userId, user.id),
                eq(userApplications.applicationId, app.id)
            )
        )
        .limit(1)
        .then(r => r[0]);

    if (!access || !access.isEnabled) {
        return {
            error: "access_denied",
            reason: "no_application_access",
        };
    }

    /* -------------------------------------------------
     * Step 6 — Verify local password
     * ------------------------------------------------- */

    const localAuth = await db
        .select({
            passwordHash: userAuthLocal.passwordHash,
            isEnabled: userAuthLocal.isEnabled,
        })
        .from(userAuthLocal)
        .where(eq(userAuthLocal.userId, user.id))
        .limit(1)
        .then(r => r[0]);

    if (!localAuth || !localAuth.isEnabled) {
        return { error: "invalid_credentials" };
    }

    const passwordOk = await bcrypt.compare(password, localAuth.passwordHash);

    if (!passwordOk) {
        return { error: "invalid_credentials" };
    }

    /* -------------------------------------------------
     * Step 7 — Issue tokens (atomic)
     * ------------------------------------------------- */

    const now = new Date();

    const refreshTokenRaw = crypto.randomBytes(64).toString("hex");
    const refreshTokenHash = crypto
        .createHash("sha256")
        .update(refreshTokenRaw)
        .digest("hex");

    const refreshExpiresAt = new Date(
        now.getTime() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000
    );

    const accessExpiresAt = new Date(
        now.getTime() + ACCESS_TOKEN_TTL_SECONDS * 1000
    );

    // NOTE: replace with real JWT helper later
    const accessToken = crypto.randomBytes(32).toString("hex");

    await db.insert(authTokens).values({
        userId: user.id,
        applicationId: app.id,
        tokenType: "refresh",
        tokenHash: refreshTokenHash,
        expiresAt: refreshExpiresAt,
        revokedAt: null,
        replacedByTokenId: null,
        createdAt: now,
    });

    /* -------------------------------------------------
     * Step 8 — Success response
     * ------------------------------------------------- */

    return {
        user: {
            id: user.id,
            username: user.username,
            email: user.email,
            status: user.statusCode,
        },
        application: {
            id: app.id,
            app_key: app.appKey,
        },
        tokens: {
            access: {
                token: accessToken,
                expires_at: accessExpiresAt.toISOString(),
            },
            refresh: {
                token: refreshTokenRaw,
                expires_at: refreshExpiresAt.toISOString(),
            },
        },
    };
}
