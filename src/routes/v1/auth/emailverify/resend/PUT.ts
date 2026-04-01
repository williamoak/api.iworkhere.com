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
 * This endpoint is intentionally non-enumerating and returns success even when
 * the email is unknown or not eligible for resend.
 *
 * @query none
 *
 * @requestExample
 * {
 *   "app_key": "example-app-key",
 *   "email": "user@example.com"
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
 *     "authContext",
 *     "emailVerificationService"
 *   ]
 * }
 */

import type { Request, Response } from 'express'
import { z } from 'zod'

import { resolveAuthContext, AuthError } from '@services/auth/authContext'
import { resendEmailVerificationToken } from '@services/auth/emailVerificationService'

export const schema = {
    body: z.object({
        app_key: z.string().trim().min(1),
        // Non-enumerating: allow missing/blank email and still return ok
        email: z.string().trim().optional(),
    }),
}

export default async function PUT(req: Request, res: Response): Promise<void> {
    try {
        const body =
            (req.validated?.body as z.infer<typeof schema.body>) ??
            req.body
        const email = body.email

        const { applicationId } = await resolveAuthContext(body)

        await resendEmailVerificationToken({
            applicationId,
            email,
        })

        res.status(200).json({ ok: true })
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
