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

import type { Request, Response } from 'express'
import { z } from 'zod'

import { AuthError } from '@services/auth/authContext'
import { verifyEmailToken } from '@services/auth/emailVerificationService'

export const schema = {
    body: z.object({
        token: z.string().trim().min(1),
    }),
}

export default async function PUT(req: Request, res: Response): Promise<void> {
    try {
        const body =
            (req.validated?.body as z.infer<typeof schema.body>) ??
            req.body
        const token = body.token

        const user = await verifyEmailToken(token)

        res.status(200).json({
            user: {
                id: user.id,
                email: user.email,
                status: 'active',
            },
        })
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
