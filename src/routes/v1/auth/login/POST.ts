/**
 * @myDocBlock v2.3
 * @file POST.ts
 * @external
 * @module routes/v1/auth/login
 * @tag auth, login
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path /v1/auth/login
 * @summary Authenticate a user for an application and issue tokens.
 * @description
 * Authenticates a user against an application-scoped context using a
 * username or email and plaintext password. On success, issues an
 * access and refresh token pair scoped to the application.
 *
 * @requestExample
 * {
 *   "app_key": "bill.iworkhere.com",
 *   "identifier": "bill",
 *   "password": "plaintext-password"
 * }
 *
 * @response
 * {
 *   "user": {
 *     "id": "uuid",
 *     "username": "bill",
 *     "email": "bill@example.com",
 *     "status": "active"
 *   },
 *   "application": {
 *     "id": "uuid",
 *     "app_key": "bill.iworkhere.com"
 *   },
 *   "tokens": {
 *     "access": {
 *       "token": "opaque",
 *       "expires_at": "ISO-8601"
 *     },
 *     "refresh": {
 *       "token": "opaque",
 *       "expires_at": "ISO-8601"
 *     }
 *   }
 * }
 *
 * @requires
 * {
 *   "services": [
 *     "authContext",
 *     "authUserResolver",
 *     "passwordService",
 *     "tokenService"
 *   ]
 * }
 */

import type { Request, Response } from 'express'
import { configGet } from '@helpers/config';
const DEBUG = configGet('DEBUG') === 'true';

import { resolveAuthContext, AuthError } from '@services/auth/authContext'
import { z } from 'zod'
import { resolveUserForApplication } from '@services/auth/authUserResolver'
import { verifyPassword } from '@services/auth/passwordService'
import { issueLoginTokens } from '@services/auth/tokenService'

export const schema = {
    body: z.object({
        app_key: z.string().trim().min(1),
        identifier: z.string().trim().min(1),
        password: z.string().min(1),
    }),
}

/**
 * POST /v1/auth/login
 */
export default async function POST(req: Request, res: Response): Promise<void> {
    if (DEBUG) console.log('[DEBUG] POST /v1/auth/login reached');
    try {
        const body =
            (req.validated?.body as z.infer<typeof schema.body>) ??
            req.body

        // 1. Resolve application context
        if (DEBUG) console.log('[DEBUG] Login route accessed. Body:', JSON.stringify(body, (key, value) => key === 'password' ? '***' : value));
        const appCtx = await resolveAuthContext(body)

        // 2. Resolve user identity + app access
        const user = await resolveUserForApplication(
            body?.identifier,
            appCtx.applicationId
        )

        // 3. Verify password
        await verifyPassword(user.userId, body?.password)

        // 4. Issue tokens
        const tokens = await issueLoginTokens(
            user.userId,
            appCtx.applicationId
        )

        // 5. Respond
        res.status(200).json({
            user: {
                id: user.userId,
                username: user.username,
                email: user.email,
                status: 'active',
            },
            application: {
                id: appCtx.applicationId,
                app_key: appCtx.applicationKey,
            },
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
        })
    } catch (err) {
        if (err instanceof AuthError) {
            res.status(err.httpStatus).json({
                error: err.code,
                message: err.message,
            })
            return
        }

        res.status(500).json({
            error: 'INTERNAL_ERROR',
            message: 'An unexpected error occurred',
        })
    }
}
