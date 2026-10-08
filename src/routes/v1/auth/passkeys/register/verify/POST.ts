/**
 * @myDocBlock v2.3
 * @file POST.ts
 * @external
 * @module routes/v1/auth/passkeys/register/verify
 * @tag auth, passkeys
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path /v1/auth/passkeys/register/verify
 * @summary Verify and store a newly registered passkey.
 * @description
 * Consumes a registration ceremony, verifies the WebAuthn attestation against
 * the authenticated user and application context, and stores only durable
 * credential metadata and the public key. Private keys and raw assertions are
 * never persisted.
 *
 * @requestExample
 * {
 *   "app_key": "joinaunion.iworkhere.com",
 *   "ceremony_token": "signed-short-lived-token",
 *   "response": { "id": "credential-id", "rawId": "base64url-credential-id", "response": { "clientDataJSON": "base64url", "attestationObject": "base64url" }, "type": "public-key" },
 *   "display_name": "Bill's MacBook"
 * }
 *
 * @response
 * {
 *   "credential": {
 *     "id": "uuid",
 *     "credentialId": "credential-id",
 *     "displayName": "Bill's MacBook",
 *     "transports": ["internal"],
 *     "lastUsedAt": null,
 *     "createdAt": "2026-10-08T12:00:00.000Z",
 *     "revokedAt": null
 *   }
 * }
 *
 * @requires
 * {
 *   "authentication": "Bearer access token",
 *   "services": ["authContext", "authUserResolver", "webauthnService"],
 *   "tables": ["passkey_credentials"]
 * }
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { resolveAuthContext } from '@services/auth/authContext';
import { resolveUserIdForApplication } from '@services/auth/authUserResolver';
import { verifyRegistration } from '@services/auth/webauthnService';

export const authRequired = true;
export const schema = { body: z.object({ app_key: z.string().trim().min(1), ceremony_token: z.string().min(1), response: z.any(), display_name: z.string().trim().max(100).optional() }) };

export default async function POST(req: Request, res: Response) {
    const body = (req.validated?.body ?? req.body) as z.infer<typeof schema.body>;
    const context = await resolveAuthContext(body);
    const userId = (req as any).auth?.userId;
    if (!userId) return res.status(401).json({ error: 'UNAUTHORIZED' });
    const user = await resolveUserIdForApplication(userId, context.applicationId);
    const credential = await verifyRegistration({
        ceremonyToken: body.ceremony_token,
        response: body.response,
        userId: user.userId,
        applicationId: context.applicationId,
        displayName: body.display_name,
    });
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ credential });
}
