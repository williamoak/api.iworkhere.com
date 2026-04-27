/**
 * @file authMe
 * @external
 * @module auth
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path /v1/auth/me
 * @summary Retrieve current authenticated user identity
 * @description
 * Validates the presence of a Bearer access token and requires that authentication middleware
 * has already attached a valid auth object to the request (req.auth.userId). This endpoint does
 * not parse or validate the token itself beyond checking for Bearer format; token validation is
 * assumed to be handled upstream.
 *
 * If a valid userId is present, retrieves the user record via getUserById and applies access gates:
 * - Rejects locked accounts with 423 ACCOUNT_LOCKED
 * - Rejects disabled accounts with 403 ACCOUNT_DISABLED
 * - Rejects users who have not accepted the EULA with 403 EULA_REQUIRED
 *
 * Returns a minimal identity payload for the authenticated user. Does not include sensitive fields.
 *
 * Debug logging can be enabled via AUTH_ME_DEBUG=1. When enabled, logs structured request lifecycle
 * events including request metadata, token hash (SHA-256), database lookup results, and response
 * outcome. Raw tokens are never logged.
 *
 * This endpoint is intended to be the canonical identity verification call after login or token
 * refresh and should be treated as the authoritative source of current user state.
 * @query
 * {}
 * @requestExample
 * {
 *   "headers": {
 *     "authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.example.payload.signature",
 *     "x-request-id": "req-1234567890"
 *   }
 * }
 * @response
 * {
 *   "200": {
 *     "id": "user_123",
 *     "username": "exampleUser",
 *     "email": "user@example.com",
 *     "status": "active"
 *   },
 *   "401": {
 *     "error": "UNAUTHORIZED"
 *   },
 *   "403": {
 *     "error": "ACCOUNT_DISABLED"
 *   },
 *   "403_EULA": {
 *     "error": "EULA_REQUIRED"
 *   },
 *   "423": {
 *     "error": "ACCOUNT_LOCKED"
 *   },
 *   "500": {
 *     "error": "INTERNAL_SERVER_ERROR"
 *   }
 * }
 * @requires
 * - authRequired = true (enforced upstream)
 * - Authentication middleware must attach req.auth.userId
 * - Authorization header must be present in Bearer format
 * - getUserById service must return a valid user object or null
 * - Environment variable AUTH_ME_DEBUG optionally enables structured debug logging
 */

import type { Request, Response } from 'express'
import { createHash, randomUUID } from 'node:crypto'
import { getUserById } from '@services/users/getUserById'
export const authRequired = true

const AUTH_ME_DEBUG = process.env.AUTH_ME_DEBUG === '1'

function dbg(reqId: string, phase: string, fields: Record<string, unknown> = {}): void {
    if (!AUTH_ME_DEBUG) return
    // eslint-disable-next-line no-console
    console.log(
        JSON.stringify({
            tag: 'auth.me',
            reqId,
            phase,
            t: new Date().toISOString(),
            ...fields,
        })
    )
}

function sha256(input: string): string {
    return createHash('sha256').update(input).digest('hex')
}

export async function GET(req: Request, res: Response): Promise<void> {
    const start = Date.now()
    const reqId =
        (req.get('x-request-id')?.trim() || '').slice(0, 128) || randomUUID()

    if (typeof (res as any).on === 'function') {
        (res as any).on('finish', () => {
            dbg(reqId, 'finish', {
                statusCode: res.statusCode,
                durationMs: Date.now() - start,
            })
        })
    }

    dbg(reqId, 'enter', {
        method: req.method,
        url: req.url,
        path: (req as any).path,
        originalUrl: (req as any).originalUrl,
        ip: req.ip,
        hasAuthorization: Boolean(req.get('authorization')),
    })

    try {
        const authHeaderRaw = req.get('authorization')
        const userId = (req as any).auth?.userId as string | undefined

        dbg(reqId, 'auth.inbound', {
            hasAuthorization: Boolean(authHeaderRaw),
            reqAuthObject: (req as any).auth,
            userId,
        })

        // Parse token (if present) and log metadata only (never raw token/header content)
        if (authHeaderRaw && authHeaderRaw.toLowerCase().startsWith('bearer ')) {
            const tokenRaw = authHeaderRaw.slice('bearer '.length).trim()

            dbg(reqId, 'auth.token', {
                tokenLen: tokenRaw.length,
                tokenSha256: sha256(tokenRaw),
            })
        } else {
            dbg(reqId, 'auth.token', {
                note: 'Authorization header missing or not Bearer.',
            })
        }

        if (!authHeaderRaw || !authHeaderRaw.toLowerCase().startsWith('bearer ')) {
            dbg(reqId, 'reject', { reason: 'missing_or_non_bearer_authorization' })
            res.status(401).json({ error: 'UNAUTHORIZED' })
            return
        }

        if (!userId) {
            dbg(reqId, 'reject', {
                reason: 'missing_req_auth_userId',
                note: 'If this happens, authMiddleware likely did not attach req.auth.',
            })
            res.status(401).json({ error: 'UNAUTHORIZED' })
            return
        }

        dbg(reqId, 'db.getUserById.start', { userId })
        const user = await getUserById(userId)
        dbg(reqId, 'db.getUserById.result', { userFound: Boolean(user), user })

        if (!user) {
            dbg(reqId, 'reject', { reason: 'user_not_found', userId })
            res.status(401).json({ error: 'UNAUTHORIZED' })
            return
        }

        dbg(reqId, 'gates', {
            status: (user as any).status,
            eulaAccepted: (user as any).eulaAccepted,
        })

        if ((user as any).status === 'locked') {
            dbg(reqId, 'reject', { reason: 'account_locked' })
            res.status(423).json({ error: 'ACCOUNT_LOCKED' })
            return
        }

        if ((user as any).status === 'disabled') {
            dbg(reqId, 'reject', { reason: 'account_disabled' })
            res.status(403).json({ error: 'ACCOUNT_DISABLED' })
            return
        }

        if ((user as any).eulaAccepted === false) {
            dbg(reqId, 'reject', { reason: 'eula_required' })
            res.status(403).json({ error: 'EULA_REQUIRED' })
            return
        }

        const responseBody = {
            id: (user as any).id,
            username: (user as any).username,
            email: (user as any).email ?? null,
            status: (user as any).status,
        }

        dbg(reqId, 'success', { responseBody })

        res.status(200).json(responseBody)
    } catch (err) {
        dbg(reqId, 'error', {
            name: err instanceof Error ? err.name : undefined,
            message: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined,
        })
        res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' })
    }
}

export default GET
