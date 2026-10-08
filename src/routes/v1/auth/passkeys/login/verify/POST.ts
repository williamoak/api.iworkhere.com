/**
 * @myDocBlock v2.3
 * @file POST.ts
 * @external
 * @module routes/v1/auth/passkeys/login/verify
 * @tag auth, passkeys
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path /v1/auth/passkeys/login/verify
 * @summary Verify a passkey assertion and issue bearer tokens.
 * @description
 * Consumes a one-time authentication ceremony and verifies the signed
 * assertion, origin, RP ID, credential ownership, revocation state, and
 * authenticator counter. On success it issues the same access and refresh
 * token shape used by password login and Google OAuth.
 *
 * @requestExample
 * {
 *   "app_key": "joinaunion.iworkhere.com",
 *   "ceremony_token": "signed-short-lived-token",
 *   "response": { "id": "credential-id", "rawId": "base64url-credential-id", "response": { "clientDataJSON": "base64url", "authenticatorData": "base64url", "signature": "base64url", "userHandle": null }, "type": "public-key" }
 * }
 *
 * @response
 * {
 *   "user": { "id": "uuid", "username": "bill", "email": "bill@example.com", "status": "active" },
 *   "application": { "id": "uuid", "app_key": "joinaunion.iworkhere.com" },
 *   "tokens": { "access": { "token": "opaque", "expires_at": "2026-10-08T12:00:00.000Z" }, "refresh": { "token": "opaque", "expires_at": "2026-11-07T12:00:00.000Z" } }
 * }
 *
 * @requires
 * {
 *   "services": ["authContext", "webauthnService", "tokenService"],
 *   "tables": ["passkey_credentials", "auth_tokens"]
 * }
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { resolveAuthContext, AuthError } from '@services/auth/authContext';
import { issueLoginTokens } from '@services/auth/tokenService';
import { verifyAuthentication } from '@services/auth/webauthnService';

export const schema = { body: z.object({ app_key: z.string().trim().min(1), ceremony_token: z.string().min(1), response: z.any() }) };

export default async function POST(req: Request, res: Response) {
    try {
        const body = (req.validated?.body ?? req.body) as z.infer<typeof schema.body>;
        const context = await resolveAuthContext(body);
        const result = await verifyAuthentication({
            ceremonyToken: body.ceremony_token,
            response: body.response,
            applicationId: context.applicationId,
        });
        const tokens = await issueLoginTokens(result.user.id, result.applicationId);
        res.locals.visitUserId = result.user.id;
        res.setHeader('Cache-Control', 'no-store');
        return res.json({
            user: { ...result.user, status: 'active' },
            application: { id: context.applicationId, app_key: context.applicationKey },
            tokens: {
                access: { token: tokens.access.token, expires_at: tokens.access.expiresAt.toISOString() },
                refresh: { token: tokens.refresh.token, expires_at: tokens.refresh.expiresAt.toISOString() },
            },
        });
    } catch (error) {
        if (error instanceof AuthError) return res.status(401).json({ error: 'PASSKEY_AUTH_FAILED', message: 'Passkey authentication failed' });
        throw error;
    }
}
