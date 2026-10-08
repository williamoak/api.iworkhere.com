/**
 * @myDocBlock v2.3
 * @file PUT.ts
 * @external
 * @module routes/v1/auth/passreset/initiate
 * @tag auth, password-reset
 * @version 1.0.1
 * @author william.r.oak@gmail.com
 * @path /v1/auth/passreset/initiate
 * @summary Initiate a password reset flow.
 * @description
 * Initiates a password reset request for a user identified by email.
 * This endpoint is intentionally non-enumerating: it always returns
 * a success response regardless of whether the email exists.
 *
 * On success, the API sends an application-specific reset link by email. The
 * token is never included in the API response, and mail delivery failures are
 * recorded by the mail audit path without revealing account existence.
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
 *     "passwordResetService",
 *     "mailer"
 *   ]
 * }
 */

import type { Request, Response } from 'express'
import { z } from 'zod'

import { sendEmail } from '@helpers/mailer'
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
        const authContext = await resolveAuthContext(body)

        // Non-enumerating by design
        const result = await initiatePasswordReset(
            body.email,
            authContext.applicationId,
        )

        // Do not send anything for unknown users. The service returns a
        // sentinel token in that case so the response remains non-enumerating.
        if (result.token !== 'noop') {
            const applicationOrigin = authContext.applicationKey.startsWith('http://') ||
                authContext.applicationKey.startsWith('https://')
                ? authContext.applicationKey
                : `https://${authContext.applicationKey}`
            const resetUrl = new URL('/auth/passreset', applicationOrigin)
            resetUrl.searchParams.set('token', result.token)
            resetUrl.searchParams.set('app_key', authContext.applicationKey)

            await sendEmail({
                to: body.email,
                subject: 'Reset your password',
                text: `Reset your password by visiting this link: ${resetUrl.toString()}`,
                html: `<p>Reset your password by clicking the link below:</p><p><a href="${resetUrl.toString()}">${resetUrl.toString()}</a></p>`,
                throwOnError: false,
                auditType: 'password_reset',
            })
        }

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
