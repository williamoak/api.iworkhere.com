/**
 * @myDocBlock v2.3
 * @file POST.ts
 * @external
 * @module routes/v1/auth/passkeys/register/options
 * @tag auth, passkeys
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path /v1/auth/passkeys/register/options
 * @summary Create a short-lived passkey registration ceremony.
 * @description
 * Creates browser-safe WebAuthn registration options for the authenticated
 * user and binds the ceremony to the resolved application, origin, RP ID,
 * user, challenge, and one-time ceremony identifier.
 *
 * @requestExample
 * {
 *   "app_key": "joinaunion.iworkhere.com",
 *   "display_name": "Bill's MacBook"
 * }
 *
 * @response
 * {
 *   "ceremony_token": "signed-short-lived-token",
 *   "publicKey": {
 *     "challenge": "base64url-challenge",
 *     "rp": { "name": "iWorkHere", "id": "joinaunion.iworkhere.com" },
 *     "user": { "id": "base64url-user-id", "name": "user@example.com", "displayName": "Bill" },
 *     "pubKeyCredParams": [{ "alg": -7, "type": "public-key" }]
 *   }
 * }
 *
 * @requires
 * {
 *   "authentication": "Bearer access token",
 *   "services": ["authContext", "authUserResolver", "webauthnService"],
 *   "configuration": ["WEBAUTHN_RP_ID", "WEBAUTHN_ALLOWED_ORIGINS", "WEBAUTHN_CEREMONY_SECRET"]
 * }
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { resolveAuthContext } from '@services/auth/authContext';
import { resolveUserIdForApplication } from '@services/auth/authUserResolver';
import { createRegistrationOptions, resolveWebAuthnOrigin } from '@services/auth/webauthnService';

export const authRequired = true;
export const schema = { body: z.object({ app_key: z.string().trim().min(1), display_name: z.string().trim().max(100).optional() }) };

export default async function POST(req: Request, res: Response) {
    const body = (req.validated?.body ?? req.body) as z.infer<typeof schema.body>;
    const context = await resolveAuthContext(body);
    const userId = (req as any).auth?.userId;
    if (!userId) return res.status(401).json({ error: 'UNAUTHORIZED' });
    const user = await resolveUserIdForApplication(userId, context.applicationId);
    const webAuthn = await resolveWebAuthnOrigin(context.applicationId, req.get('origin'));
    const result = await createRegistrationOptions({
        userId: user.userId,
        applicationId: context.applicationId,
        applicationKey: context.applicationKey,
        username: user.email,
        displayName: body.display_name,
        origin: webAuthn.origin,
        rpId: webAuthn.rpId,
    });
    res.setHeader('Cache-Control', 'no-store');
    return res.json(result);
}
