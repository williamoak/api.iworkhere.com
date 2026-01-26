/**
 * @myDocBlock v2.3
 * @file PUT.ts
 * @external
 * @module routes/v1/auth/passreset/complete
 * @tag auth, password, reset
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path /v1/auth/passreset/complete
 * @summary Complete a password reset.
 * @description
 * Consumes a valid password reset token and sets a new password.
 * On success, all existing auth tokens are revoked.
 *
 * @requestExample
 * {
 *   "token": "opaque-reset-token",
 *   "new_password": "new-strong-password"
 * }
 *
 * @response
 * {
 *   "ok": true
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
import { completePasswordReset } from '@services/auth/passwordResetService'

export default async function PUT(
    req: IncomingMessage,
    res: ServerResponse
): Promise<void> {
    try {
        const { token, new_password } = (req as any).body ?? {}

        if (!token || !new_password) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(
                JSON.stringify({
                    error: 'INVALID_REQUEST',
                    message: 'token and new_password are required',
                })
            )
            return
        }

        await completePasswordReset(token, new_password)

        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: true }))
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
