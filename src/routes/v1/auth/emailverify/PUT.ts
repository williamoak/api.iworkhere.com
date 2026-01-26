/**
 * @myDocBlock v2.3
 * @file PUT.ts
 * @external
 * @module routes/v1/auth/emailverify
 * @tag auth, email, verify
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path /v1/auth/emailverify
 * @summary Verify a user email address.
 * @description
 * Verifies ownership of a user email address using a verification token.
 * On success, the user account is transitioned to an active state and
 * the email verification timestamp is recorded.
 *
 * @requestExample
 * {
 *   "token": "opaque-verification-token"
 * }
 *
 * @response
 * {
 *   "user": {
 *     "id": "uuid",
 *     "email": "user@example.com",
 *     "status": "active"
 *   }
 * }
 *
 * @requires
 * {
 *   "services": [
 *     "emailVerificationService"
 *   ]
 * }
 */

import type { IncomingMessage, ServerResponse } from 'http'

import { AuthError } from '@services/auth/authContext'
import { verifyEmailToken } from '@services/auth/emailVerificationService'

export default async function PUT(
    req: IncomingMessage,
    res: ServerResponse
): Promise<void> {
    try {
        const body = (req as any).body
        const token = body?.token

        if (!token) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(
                JSON.stringify({
                    error: 'INVALID_REQUEST',
                    message: 'verification token is required',
                })
            )
            return
        }

        const user = await verifyEmailToken(token)

        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.end(
            JSON.stringify({
                user: {
                    id: user.id,
                    email: user.email,
                    status: 'active',
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
