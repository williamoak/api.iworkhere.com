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
 * On success, the API sends a short-lived reset code by email. The code is
 * never included in the API response, and mail delivery failures are recorded
 * by the mail audit path without revealing account existence. No clickable URL
 * is included, so email-provider click tracking cannot redirect the user to
 * an unrelated landing page.
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
            await sendEmail({
                to: body.email,
                subject: 'Reset your password',
                text: `Your password reset code is: ${result.token}\n\nEnter this six-character code in the password reset screen. It expires soon and can only be used once.`,
                html: `<p>Your password reset code is:</p><p><strong>${result.token}</strong></p><p>Enter this six-character code in the password reset screen. It expires soon and can only be used once.</p>`,
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
