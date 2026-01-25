/**
 * @myDocBlock
 * @file tokenService.ts
 * @external false
 * @module services/auth
 * @tag auth, token, session, security
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path src/services/auth/tokenService.ts
 * @summary Issues, rotates, and revokes application-scoped authentication tokens.
 * @description
 * Central authority for all token lifecycle operations. This module generates
 * opaque access and refresh tokens, hashes them before persistence, enforces
 * expiration and revocation rules, and supports refresh token rotation.
 *
 * Tokens are always scoped to both user and application, and raw token values
 * are never stored or logged.
 *
 * This module throws typed AuthError instances and does not perform any HTTP
 * response handling.
 *
 * @requires
 * {
 *   "tables": [
 *     "auth_tokens"
 *   ],
 *   "services": [
 *     "@services/dbService"
 *   ],
 *   "libraries": [
 *     "crypto"
 *   ]
 * }
 *
 * @internal
 */

import crypto from 'crypto'
import { db } from '@services/dbService'
import { authTokens } from '@db/schema'
import { and, eq, isNull, lt } from 'drizzle-orm'
import { AuthError } from './authContext'
import { configGetNumber } from '@helpers/config'

const ACCESS_TOKEN_TTL_SECONDS = configGetNumber(
    'ACCESS_TOKEN_TTL_SECONDS',
    { min: 60 }
)

const REFRESH_TOKEN_TTL_SECONDS = configGetNumber(
    'REFRESH_TOKEN_TTL_SECONDS',
    { min: 300 }
)

type IssuedToken = {
    token: string
    expiresAt: Date
}

type IssuedTokenPair = {
    access: IssuedToken
    refresh: IssuedToken
}

/**
 * Generate a cryptographically secure opaque token.
 */
function generateToken(): string {
    return crypto.randomBytes(32).toString('hex')
}

/**
 * Hash a token using SHA-256 for storage.
 */
function hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex')
}

/**
 * Issue access and refresh tokens for login.
 */
export async function issueLoginTokens(
    userId: string,
    applicationId: string
): Promise<IssuedTokenPair> {
    const accessToken = generateToken()
    const refreshToken = generateToken()

    const accessExpiresAt = new Date(
        Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000
    )
    const refreshExpiresAt = new Date(
        Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000
    )

    await db.insert(authTokens).values([
        {
            userId,
            applicationId,
            tokenType: 'access',
            tokenHash: hashToken(accessToken),
            expiresAt: accessExpiresAt,
        },
        {
            userId,
            applicationId,
            tokenType: 'refresh',
            tokenHash: hashToken(refreshToken),
            expiresAt: refreshExpiresAt,
        },
    ])

    return {
        access: {
            token: accessToken,
            expiresAt: accessExpiresAt,
        },
        refresh: {
            token: refreshToken,
            expiresAt: refreshExpiresAt,
        },
    }
}

/**
 * Rotate a refresh token and issue a new access + refresh token pair.
 */
export async function refreshTokens(
    refreshToken: unknown
): Promise<IssuedTokenPair> {
    if (typeof refreshToken !== 'string' || !refreshToken) {
        throw new AuthError(
            'INVALID_TOKEN',
            'Invalid token',
            401
        )
    }

    const tokenHash = hashToken(refreshToken)

    const rows = await db
        .select()
        .from(authTokens)
        .where(
            and(
                eq(authTokens.tokenHash, tokenHash),
                eq(authTokens.tokenType, 'refresh'),
                isNull(authTokens.revokedAt),
                lt(authTokens.expiresAt, new Date())
            )
        )
        .limit(1)

    if (rows.length === 0) {
        throw new AuthError(
            'TOKEN_INVALID',
            'Token is invalid or expired',
            401
        )
    }

    const existing = rows[0]

    const newAccessToken = generateToken()
    const newRefreshToken = generateToken()

    const newAccessExpiresAt = new Date(
        Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000
    )
    const newRefreshExpiresAt = new Date(
        Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000
    )

    await db.transaction(async (tx) => {
        await tx
            .update(authTokens)
            .set({
                revokedAt: new Date(),
            })
            .where(eq(authTokens.id, existing.id))

        const inserted = await tx
            .insert(authTokens)
            .values({
                userId: existing.userId,
                applicationId: existing.applicationId,
                tokenType: 'refresh',
                tokenHash: hashToken(newRefreshToken),
                expiresAt: newRefreshExpiresAt,
            })
            .returning({ id: authTokens.id })

        await tx.insert(authTokens).values({
            userId: existing.userId,
            applicationId: existing.applicationId,
            tokenType: 'access',
            tokenHash: hashToken(newAccessToken),
            expiresAt: newAccessExpiresAt,
            replacedByTokenId: inserted[0].id,
        })
    })

    return {
        access: {
            token: newAccessToken,
            expiresAt: newAccessExpiresAt,
        },
        refresh: {
            token: newRefreshToken,
            expiresAt: newRefreshExpiresAt,
        },
    }
}

/**
 * Revoke a token explicitly (logout or security event).
 */
export async function revokeToken(
    token: unknown
): Promise<void> {
    if (typeof token !== 'string' || !token) {
        return
    }

    const tokenHash = hashToken(token)

    await db
        .update(authTokens)
        .set({
            revokedAt: new Date(),
        })
        .where(eq(authTokens.tokenHash, tokenHash))
}
