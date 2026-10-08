/**
 * @myDocBlock v2.3
 * @file DELETE.ts
 * @external
 * @module routes/v1/auth/passkeys
 * @tag auth, passkeys
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path /v1/auth/passkeys
 * @summary Revoke one of the authenticated user's passkeys.
 * @description
 * Marks the application-scoped credential as revoked so it cannot be used for
 * future passkey authentication. Existing bearer sessions remain unchanged.
 *
 * @requestExample
 * { "app_key": "joinaunion.iworkhere.com", "credential_id": "credential-id" }
 *
 * @response
 * { "revoked": true }
 *
 * @requires
 * { "authentication": "Bearer access token", "services": ["authContext", "webauthnService"], "tables": ["passkey_credentials"] }
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { resolveAuthContext } from '@services/auth/authContext';
import { revokePasskey } from '@services/auth/webauthnService';

export const authRequired = true;
export const schema = { body: z.object({ app_key: z.string().trim().min(1), credential_id: z.string().min(1) }) };

export default async function DELETE(req: Request, res: Response) {
    const body = (req.validated?.body ?? req.body) as z.infer<typeof schema.body>;
    const context = await resolveAuthContext(body);
    const userId = (req as any).auth?.userId;
    if (!userId) return res.status(401).json({ error: 'UNAUTHORIZED' });
    const revoked = await revokePasskey(userId, context.applicationId, body.credential_id);
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ revoked: revoked.length > 0 });
}
