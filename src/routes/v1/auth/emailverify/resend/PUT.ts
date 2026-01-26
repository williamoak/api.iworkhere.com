/**
 * @myDocBlock v2.3
 * @file PUT.ts
 * @external
 * @module routes/v1/auth/emailverify/resend
 * @tag auth, email, verify
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path /v1/auth/emailverify/resend
 * @summary Resend an email verification token.
 * @description
 * Allows a pending user to request a new email verification token.
 * This endpoint is non-enumerating and always returns success.
 */

import type { IncomingMessage, ServerResponse } from 'http'

import { resolveAuthContext, AuthError } from '@services/auth/authContext'
import { resendEmailVerificationToken } from '@services/auth/emailVerificationService'

export default async function PUT(
    req: IncomingMessage,
    res: ServerResponse
): Promise<void> {
    try {
        const body = (req as any).body
        const { email } = body ?? {}

        const { applicationId } = await resolveAuthContext(body)

        await resendEmailVerificationToken({
            applicationId,
            email,
        })

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
