/**
 * @myDocBlock v2.3
 * @file GET.ts
 * @external
 * @module routes/v1/auth/emailverify
 * @tag auth, email, verify
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path /v1/auth/emailverify
 * @summary Verify email via GET (browser link).
 * @description
 *   Handles verification requests originating from email links.
 *   Reads the token from the query string, performs verification,
 *   and redirects the user to the application.
 */

import type { Request, Response } from 'express'
import { z } from 'zod'

import { AuthError } from '@services/auth/authContext'
import { verifyEmailToken } from '@services/auth/emailVerificationService'
import { configGet } from '@helpers/config'

export const schema = {
    query: z.object({
        token: z.string().trim().min(1),
    }),
}

export default async function GET(req: Request, res: Response): Promise<void> {
    const appUrl = configGet('APP_URL')

    try {
        const query = (req.validated?.query as z.infer<typeof schema.query>) ?? req.query
        const { token } = query

        // Perform the same verification logic as the PUT route
        await verifyEmailToken(token)

        /**
         * SUCCESS REDIRECT
         * You can redirect to your website, or a custom deep-link
         * scheme that opens your React Native app automatically.
         */
        res.redirect(`${appUrl}/verification-success?status=verified`)
    } catch (err) {
        // If verification fails (e.g. token expired or already used)
        const errorCode = err instanceof AuthError ? err.code : 'VERIFICATION_FAILED'

        res.redirect(`${appUrl}/verification-error?error=${errorCode}`)
    }
}
