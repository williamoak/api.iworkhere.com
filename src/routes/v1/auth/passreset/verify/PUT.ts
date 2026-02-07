/**
 * @myDocBlock v2.3
 * @file PUT.ts
 * @external
 * @module routes/v1/auth/passreset/verify
 * @tag auth, password, reset
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path /v1/auth/passreset/verify
 * @summary Verify a password reset token.
 * @description
 * Validates a password reset token without changing user state.
 * Used by clients to confirm token validity before submitting
 * a new password.
 *
 * @requestExample
 * {
 *   "token": "opaque-reset-token"
 * }
 *
 * @response
 * {
 *   "valid": true
 * }
 *
 * @requires
 * {
 *   "services": [
 *     "passwordResetService"
 *   ]
 * }
 */

import type { Request, Response } from 'express'
import { z } from 'zod'

import { AuthError } from '@services/auth/authContext'
import { verifyPasswordResetToken } from '@services/auth/passwordResetService'

export const schema = {
    body: z.object({
        token: z.string().trim().min(1),
    }),
}

export default async function PUT(req: Request, res: Response): Promise<void> {
    try {
        // Validate request shape BEFORE calling services
        const parsed = schema.body.safeParse(req.body)
        if (!parsed.success) {
            res.status(400).json({
                error: 'INVALID_REQUEST',
                message: 'Invalid request body',
            })
            return
        }

        const body = parsed.data

        await verifyPasswordResetToken(body.token)

        res.status(200).json({ valid: true })
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
