/**
 * @myDocBlock
 * @file
 * @version 1.0.2
 * @author @william.r.oak@gmail.com
 * @path /v1/auth/me
 * @summary Canonical authenticated-identity verification endpoint
 *
 * @description
 * This endpoint is the authoritative identity gate for authenticated sessions.
 * It answers exactly one question:
 *   "Given the presented access token, who is the user right now,
 *    and are they currently allowed to be authenticated?"
 *
 * This endpoint performs no token refresh, no profile mutation,
 * and no role expansion. It must never return partial identity.
 *
 * Authentication succeeds only if the access token is valid and the
 * account is fully permitted to authenticate at the current moment.
 *
 * @requestExample
 * GET /v1/auth/me
 * Authorization: Bearer <accessToken>
 *
 * @response
 * 200 application/json
 * {
 *   "id": "uuidv7",
 *   "username": "string",
 *   "email": "string | null",
 *   "status": "active" | "pending"
 * }
 *
 * @response
 * 401 application/json
 * {
 *   "error": "UNAUTHORIZED"
 * }
 *
 * @response
 * 403 application/json
 * {
 *   "error": "ACCOUNT_DISABLED" | "EULA_REQUIRED"
 * }
 *
 * @response
 * 423 application/json
 * {
 *   "error": "ACCOUNT_LOCKED"
 * }
 *
 * @requires
 * - Valid access token provided via Authorization header
 * - Auth middleware must attach req.auth.userId
 * - Fresh user state must be loaded from the database (no cache)
 * - Role and admin enforcement handled by middleware
 */

import type { Request, Response } from 'express'
import { getUserById } from '@services/users/getUserById'

/**
 * GET /v1/auth/me
 *
 * Canonical identity endpoint.
 * Answers: "Given this access token, who am I right now,
 * and am I allowed to be authenticated?"
 */
export async function GET(req: Request, res: Response): Promise<void> {
    /**
     * Auth middleware invariant:
     * - If we are here, the access token was present and cryptographically valid
     * - req.auth.userId MUST exist
     */
    const userId = req.auth?.userId

    const authHeader = req.get('authorization')

    if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
        res.status(401).json({ error: 'UNAUTHORIZED' })
        return
    }

    if (!userId) {
        // Defensive: should never happen if middleware is correct
        res.status(401).json({ error: 'UNAUTHORIZED' })
        return
    }

    /**
     * Always fetch fresh user state.
     * No cache. No derived identity.
     */
    const user = await getUserById(userId)

    if (!user) {
        // Token valid but user no longer exists
        res.status(401).json({ error: 'UNAUTHORIZED' })
        return
    }

    /**
     * Hard authentication gates
     * No degradation, no partial identity
     */
    if (user.status === 'locked') {
        res.status(423).json({ error: 'ACCOUNT_LOCKED' })
        return
    }

    if (user.status === 'disabled') {
        res.status(403).json({ error: 'ACCOUNT_DISABLED' })
        return
    }

    if (user.eulaAccepted === false) {
        res.status(403).json({ error: 'EULA_REQUIRED' })
        return
    }

    /**
     * Success: user is fully authenticated
     * Shape must exactly match frontend AuthUser
     */
    res.status(200).json({
        id: user.id,
        username: user.username,
        email: user.email ?? null,
        status: user.status
    })
}

export default GET


