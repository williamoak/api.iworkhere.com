/**
 * @myDocBlock v2.3
 * @file PUT.ts
 * @external
 * @module routes/v1/auth/passreset/initiate
 * @tag auth, password-reset
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path /v1/auth/passreset/initiate
 * @summary Initiate a password reset flow.
 * @description
 * Initiates a password reset request for a user identified by email.
 * This endpoint is intentionally non-enumerating: it always returns
 * a success response regardless of whether the email exists.
 *
 * On success, a password reset token is issued out-of-band (e.g. email).
 *
 * @requestExample
 * {
 *   "app_key": "bill.iworkhere.com",
 *   "email": "user@example.com"
 * }
 *
 * @response
 * {
 *   "status": "ok"
 * }
 *
 * @requires
 * {
 *   "services": [
 *     "authContext",
 *     "passwordResetService"
 *   ]
 * }
 */

import type { IncomingMessage, ServerResponse } from 'http'

import { resolveAuthContext, AuthError } from '@services/auth/authContext'
import { initiatePasswordReset } from '@services/auth/passwordResetService'

export default async function PUT(
    req: IncomingMessage,
    res: ServerResponse
): Promise<void> {
    try {
        const body = (req as any).body
        const email = body?.email

        // Validate request shape BEFORE calling services
        if (!email || typeof email !== 'string') {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(
                JSON.stringify({
                    error: 'INVALID_REQUEST',
                    message: 'email is required',
                })
            )
            return
        }

        // Resolve application context (may throw AuthError)
        await resolveAuthContext(body)

        // Non-enumerating by design
        await initiatePasswordReset(email)

        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ status: 'ok' }))
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
