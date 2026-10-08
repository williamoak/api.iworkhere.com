/**
 * @myDocBlock v2.3
 * @file PUT.ts
 * @external
 * @module routes/v1/auth/passreset/complete
 * @tag auth, password, reset
 * @version 1.0.1
 * @author william.r.oak@gmail.com
 * @path /v1/auth/passreset/complete
 * @summary Complete a password reset.
 * @description
 * Consumes a valid password reset token and sets a new password. When app_key
 * is supplied, the token must belong to that application's scope; legacy
 * unscoped tokens remain compatible when app_key is omitted.
 * On success, all existing auth tokens are revoked.
 *
 * @requestExample
 * {
 *   "token": "opaque-reset-token",
 *   "new_password": "new-strong-password",
 *   "app_key": "bill.iworkhere.com"
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
 *     "passwordResetService",
 *     "authContext"
 *   ]
 * }
 */

import type { Request, Response } from 'express'
import { z } from 'zod'

import { AuthError, resolveAuthContext } from '@services/auth/authContext'
import { completePasswordReset } from '@services/auth/passwordResetService'

export const schema = {
    body: z.object({
        token: z.string().trim().min(1),
        new_password: z.string().trim().min(1),
        app_key: z.string().trim().min(1).optional(),
    }),
}

export default async function PUT(req: Request, res: Response): Promise<void> {
    try {
        const body =
            (req.validated?.body as z.infer<typeof schema.body>) ??
            req.body

        const authContext = body.app_key
            ? await resolveAuthContext(body)
            : undefined

        if (authContext) {
            await completePasswordReset(
                body.token,
                body.new_password,
                authContext.applicationId,
            )
        } else {
            await completePasswordReset(body.token, body.new_password)
        }

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
