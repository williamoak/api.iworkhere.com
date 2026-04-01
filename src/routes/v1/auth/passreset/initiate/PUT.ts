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

import type { Request, Response } from 'express'
import { z } from 'zod'

import { resolveAuthContext, AuthError } from '@services/auth/authContext'
import { initiatePasswordReset } from '@services/auth/passwordResetService'

const EmailSchema = z.preprocess(
    (v) => (typeof v === 'string' ? v.trim() : v),
    z.email(),
)

export const schema = {
    body: z.object({
        app_key: z.string().trim().min(1),
        email: EmailSchema,
    }),
}

export default async function PUT(req: Request, res: Response): Promise<void> {
    try {
        const body =
            (req.validated?.body as z.infer<typeof schema.body>) ??
            req.body

        // Resolve application context (may throw AuthError)
        await resolveAuthContext(body)

        // Non-enumerating by design
        await initiatePasswordReset(body.email)

        res.status(200).json({ status: 'ok' })
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
