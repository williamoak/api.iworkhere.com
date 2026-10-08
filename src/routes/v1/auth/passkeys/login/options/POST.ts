/**
 * @myDocBlock v2.3
 * @file POST.ts
 * @external
 * @module routes/v1/auth/passkeys/login/options
 * @tag auth, passkeys
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path /v1/auth/passkeys/login/options
 * @summary Create a short-lived passkey authentication ceremony.
 * @description
 * Creates discoverable-credential WebAuthn authentication options for the
 * resolved application. The response is bound to the configured origin and RP
 * ID and is intentionally not cacheable.
 *
 * @requestExample
 * {
 *   "app_key": "joinaunion.iworkhere.com"
 * }
 *
 * @response
 * {
 *   "ceremony_token": "signed-short-lived-token",
 *   "publicKey": {
 *     "challenge": "base64url-challenge",
 *     "rpId": "joinaunion.iworkhere.com",
 *     "allowCredentials": [],
 *     "userVerification": "preferred"
 *   }
 * }
 *
 * @requires
 * {
 *   "services": ["authContext", "webauthnService"],
 *   "configuration": ["WEBAUTHN_RP_ID", "WEBAUTHN_ALLOWED_ORIGINS", "WEBAUTHN_CEREMONY_SECRET"]
 * }
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { resolveAuthContext } from '@services/auth/authContext';
import { createAuthenticationOptions, resolveWebAuthnOrigin } from '@services/auth/webauthnService';

export const schema = { body: z.object({ app_key: z.string().trim().min(1) }) };

export default async function POST(req: Request, res: Response) {
    const body = (req.validated?.body ?? req.body) as z.infer<typeof schema.body>;
    const context = await resolveAuthContext(body);
    const webAuthn = await resolveWebAuthnOrigin(context.applicationId, req.get('origin'));
    const result = await createAuthenticationOptions({
        applicationId: context.applicationId,
        applicationKey: context.applicationKey,
        origin: webAuthn.origin,
        rpId: webAuthn.rpId,
    });
    res.setHeader('Cache-Control', 'no-store');
    return res.json(result);
}
