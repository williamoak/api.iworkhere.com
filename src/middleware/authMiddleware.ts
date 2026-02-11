/**
 * @myDocBlock
 * @file authMiddleware.ts
 * @internal
 * @module Middleware
 * @tag api, auth
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path src/middleware/authMiddleware.ts
 * @summary Access token authentication middleware.
 * @description
 *   Validates a Bearer access token from the Authorization header,
 *   enforces token type, expiration, and revocation status, and
 *   attaches req.auth.userId on success.
 *
 * @requires
 *   - express
 *   - crypto
 *   - @services/dbService
 *   - @db/schema (auth_tokens)
 */

import type { Request, Response, NextFunction } from 'express'
import crypto from 'crypto'

import { db } from '@services/dbService'
import { authTokens } from '@db/schema'
import { and, eq, gt, isNull } from 'drizzle-orm'

const BEARER_PREFIX = 'bearer '

function extractBearerToken(req: Request): string | null {
    const header = req.get('authorization')

    if (!header) return null

    const trimmed = header.trim()
    if (!trimmed.toLowerCase().startsWith(BEARER_PREFIX)) {
        return null
    }

    const token = trimmed.slice(BEARER_PREFIX.length).trim()
    return token || null
}

function hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex')
}

export function authMiddleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const token = extractBearerToken(req)

            if (!token) {
                return res.status(401).json({ error: 'UNAUTHORIZED' })
            }

            const tokenHash = hashToken(token)

            const rows = await db
                .select({ userId: authTokens.userId })
                .from(authTokens)
                .where(
                    and(
                        eq(authTokens.tokenHash, tokenHash),
                        eq(authTokens.tokenType, 'access'),
                        isNull(authTokens.revokedAt),
                        gt(authTokens.expiresAt, new Date())
                    )
                )
                .limit(1)

            if (rows.length === 0) {
                return res.status(401).json({ error: 'UNAUTHORIZED' })
            }

            req.auth = { userId: rows[0].userId }

            return next()
        } catch (err) {
            return next(err)
        }
    }
}
