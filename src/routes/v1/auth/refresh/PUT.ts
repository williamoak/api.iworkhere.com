/**
 * @myDocBlock v2.3
 * @file PUT.ts
 * @external
 * @module routes/v1/auth/refresh
 * @tag auth, refresh
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path /v1/auth/refresh
 * @summary Rotate refresh token and issue new authentication tokens.
 * @description
 * Accepts a valid refresh token and rotates it, issuing a new access
 * token and a new refresh token scoped to the same user and application.
 *
 * The old refresh token is revoked as part of the rotation process.
 *
 * @requestExample
 * {
 *   "refresh_token": "opaque-refresh-token"
 * }
 *
 * @response
 * {
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
 *     "tokenService"
 *   ]
 * }
 */

import type { IncomingMessage, ServerResponse } from 'http'

import { refreshTokens } from '@services/auth/tokenService'
import { AuthError } from '@services/auth/authContext'

/**
 * PUT /v1/auth/refresh
 */
export default async function PUT(
    req: IncomingMessage,
    res: ServerResponse
): Promise<void> {
    try {
        const body = (req as any).body
        const refreshToken = body?.refresh_token

        const tokens = await refreshTokens(refreshToken)

        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.end(
            JSON.stringify({
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
        )
    } catch (err) {
        if (err instanceof AuthError) {
            res.statusCode = err.httpStatus
            res.setHeader('Content-Type', 'application/json')
            res.end(
                JSON.stringify({
                    error: err.code,
                    message: err.message,
                })
            )
            return
        }

        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(
            JSON.stringify({
                error: 'INTERNAL_ERROR',
                message: 'An unexpected error occurred',
            })
        )
    }
}
