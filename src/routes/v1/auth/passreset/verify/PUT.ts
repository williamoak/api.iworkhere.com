/**
 * @myDocBlock v2.3
 * @file PUT.ts
 * @external
 * @module routes/v1/auth/passreset/verify
 * @tag auth, password, reset
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path /v1/auth/passreset/verify
 * @summary Verify a password reset token.
 * @description
 * Validates a password reset token without changing user state.
 * Used by clients to confirm token validity before submitting
 * a new password.
 *
 * @requestExample
 * {
 *   "token": "opaque-reset-token"
 * }
 *
 * @response
 * {
 *   "valid": true
 * }
 *
 * @requires
 * {
 *   "services": [
 *     "passwordResetService"
 *   ]
 * }
 */

import type { IncomingMessage, ServerResponse } from 'http'
import { AuthError } from '@services/auth/authContext'
import { verifyPasswordResetToken } from '@services/auth/passwordResetService'

export default async function PUT(
    req: IncomingMessage,
    res: ServerResponse
): Promise<void> {
    try {
        const { token } = (req as any).body ?? {}

        if (!token) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(
                JSON.stringify({
                    error: 'INVALID_REQUEST',
                    message: 'token is required',
                })
            )
            return
        }

        await verifyPasswordResetToken(token)

        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ valid: true }))
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
