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

import { revokeToken } from '@services/auth/tokenService'
import { AuthError } from '@services/auth/authContext'
import { configGet } from '@helpers/config';

import { z } from 'zod';

const DEBUG = configGet('DEBUG');

export const schema = {
  body: z.object({}).optional(),
};

/**
 * DELETE /v1/auth/token
 */
export default async function DELETE(
    req: Request,
    res: Response
): Promise<void> {
    try {
        const token = req.cookies.auth_token;
        if (!token) {
            // If no token, nothing to revoke.
            res.cookie("auth_token", "", {
            expires: new Date(0),
            path: '/',
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production'
        });
            res.status(204).end();
            return;
        }

        await revokeToken(token)

        res.clearCookie('auth_token', { path: '/' });
        if (DEBUG) console.log('[DEBUG] [DELETE] auth_token cookie set to expire, secure:', process.env.NODE_ENV === 'production');
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
