/**
 * @myDocBlock v2.3
 * @file GET.ts
 * @external
 * @module routes/v1/auth/passkeys
 * @tag auth, passkeys
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path /v1/auth/passkeys
 * @summary List the authenticated user's passkeys.
 * @description
 * Returns non-secret metadata for active and revoked passkeys belonging to the
 * authenticated user within the resolved application. Public keys and raw
 * assertions are not returned.
 *
 * @query
 * { "app_key": { "type": "string", "required": true, "description": "Application key used to resolve scope" } }
 *
 * @requestExample
 * none
 *
 * @response
 * { "credentials": [{ "id": "uuid", "credentialId": "credential-id", "displayName": "Bill's MacBook", "transports": ["internal"], "lastUsedAt": null, "createdAt": "2026-10-08T12:00:00.000Z", "revokedAt": null }] }
 *
 * @requires
 * { "authentication": "Bearer access token", "services": ["authContext", "authUserResolver", "webauthnService"], "tables": ["passkey_credentials"] }
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { resolveAuthContext } from '@services/auth/authContext';
import { resolveUserIdForApplication } from '@services/auth/authUserResolver';
import { listPasskeys } from '@services/auth/webauthnService';

export const authRequired = true;
export const schema = { query: z.object({ app_key: z.string().trim().min(1) }) };

export default async function GET(req: Request, res: Response) {
    const query = (req.validated?.query ?? req.query) as z.infer<typeof schema.query>;
    const context = await resolveAuthContext(query);
    const userId = (req as any).auth?.userId;
    if (!userId) return res.status(401).json({ error: 'UNAUTHORIZED' });
    const user = await resolveUserIdForApplication(userId, context.applicationId);
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ credentials: await listPasskeys(user.userId, context.applicationId) });
}
