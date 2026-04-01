/**
 * @myDocBlock v2.3
 * @file DELETE.ts
 * @external
 * @module routes/v1/auth/token
 * @tag auth, logout, revoke
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path /v1/auth/token
 * @summary Revoke an authentication token.
 * @description
 * Explicitly revokes an access or refresh token. Used for logout,
 * security events, or credential changes. Revocation is immediate.
 *
 * @requestExample
 * {
 *   "token": "opaque-token"
 * }
 *
 * @response
 * (204 No Content)
 *
 * @requires
 * {
 *   "services": [
 *     "tokenService"
 *   ]
 * }
 */

import type { Request, Response } from 'express'
import { z } from 'zod'

import { revokeToken } from '@services/auth/tokenService'
import { AuthError } from '@services/auth/authContext'

export const schema = {
    body: z.object({
        token: z.string().trim().min(1),
    }),
}

/**
 * DELETE /v1/auth/token
 */
export default async function DELETE(
    req: Request,
    res: Response
): Promise<void> {
    try {
        const body =
            (req.validated?.body as z.infer<typeof schema.body>) ??
            req.body
        const token = body.token

        await revokeToken(token)

        res.status(204).end()
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
