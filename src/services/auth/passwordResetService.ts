/**
 * @myDocBlock v2.3
 * @file passwordResetService.ts
 * @internal
 * @module services/auth/passwordResetService
 * @tag auth, password, reset
 * @version 1.0.0
 * @path none
 * @summary Password reset domain services.
 * @description
 * Handles password reset lifecycle operations including initiation,
 * verification, and completion. New reset codes are six-character,
 * single-use, time-limited, and stored hashed only. Legacy long tokens
 * remain accepted during the transition to code-based reset.
 */

import crypto from 'crypto'
import { v7 as uuidv7 } from 'uuid'
import { and, eq, isNull, or } from 'drizzle-orm'

import { db } from '@services/dbService'
import { AuthError } from '@services/auth/authContext'
import { configGet } from '@helpers/config'
import {
    users,
    passwordResetTokens,
    userAuthLocal,
    authTokens,
} from '@db/schema'
import { enforcePasswordHistory, hashPassword } from '@services/auth/passwordService'
import { cacheStore } from '@cache/cacheStore'
import { logger } from '@helpers/logger'

/**
 * Configuration
 */
const RESET_TOKEN_TTL_SECONDS = Number(
    configGet('RESET_TOKEN_TTL_SECONDS')
)

if (!Number.isFinite(RESET_TOKEN_TTL_SECONDS) || RESET_TOKEN_TTL_SECONDS <= 0) {
    throw new Error('RESET_TOKEN_TTL_SECONDS must be a positive number')
}

const RESET_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const RESET_CODE_LENGTH = 6

/**
 * Generate a short reset code without modulo bias.
 */
function generateToken(): { raw: string; hash: string } {
    let raw = ''
    for (let index = 0; index < RESET_CODE_LENGTH; index += 1) {
        raw += RESET_CODE_ALPHABET[crypto.randomInt(RESET_CODE_ALPHABET.length)]
    }
    const hash = crypto.createHash('sha256').update(raw).digest('hex')
    return { raw, hash }
}

/**
 * Initiate password reset
 */
export async function initiatePasswordReset(
    identifier: string,
    applicationId: string,
): Promise<{ token: string }> {
    if (!identifier || identifier.trim() === '') {
        throw new AuthError(
            'INVALID_REQUEST',
            'identifier is required',
            400
        )
    }

    const rows = await db
        .select({
            userId: users.id,
            status: users.statusCode,
        })
        .from(users)
        .where(
            or(
                eq(users.username, identifier),
                eq(users.email, identifier)
            )
        )
        .limit(1)

    // Prevent user enumeration
    if (rows.length === 0) {
        return { token: 'noop' }
    }

    const user = rows[0]

    if (user.status !== 'active') {
        throw new AuthError(
            'USER_NOT_ACTIVE',
            'User is not active',
            403
        )
    }

    const { raw, hash } = generateToken()

    const expiresAt = new Date(
        Date.now() + RESET_TOKEN_TTL_SECONDS * 1000
    )

    await db.insert(passwordResetTokens).values({
        id: uuidv7(),
        userId: user.userId,
        applicationId,
        tokenHash: hash,
        expiresAt,
    })

    return { token: raw }
}

/**
 * Verify password reset token
 */
export async function verifyPasswordResetToken(
    token: string,
    applicationId?: string,
): Promise<{ userId: string }> {
    if (!token || token.trim() === '') {
        throw new AuthError(
            'INVALID_TOKEN',
            'reset token is required',
            400
        )
    }

    const tokenHash = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex')

    const rows = await db
        .select({
            tokenId: passwordResetTokens.id,
            userId: passwordResetTokens.userId,
            expiresAt: passwordResetTokens.expiresAt,
        })
        .from(passwordResetTokens)
        .where(
            applicationId
                ? and(
                    eq(passwordResetTokens.tokenHash, tokenHash),
                    or(
                        isNull(passwordResetTokens.applicationId),
                        eq(passwordResetTokens.applicationId, applicationId),
                    ),
                )
                : eq(passwordResetTokens.tokenHash, tokenHash),
        )
        .limit(1)

    if (rows.length === 0) {
        throw new AuthError(
            'INVALID_TOKEN',
            'Reset token is invalid',
            401
        )
    }

    const row = rows[0]

    if (row.expiresAt && row.expiresAt < new Date()) {
        throw new AuthError(
            'TOKEN_EXPIRED',
            'Reset token has expired',
            401
        )
    }

    return { userId: row.userId }
}

/**
 * Complete password reset
 */
export async function completePasswordReset(
    token: string,
    newPassword: string,
    applicationId?: string,
): Promise<void> {
    if (!token || token.trim() === '') {
        throw new AuthError(
            'INVALID_TOKEN',
            'Reset code is required',
            400
        )
    }

    if (!newPassword || newPassword.trim() === '') {
        throw new AuthError(
            'INVALID_REQUEST',
            'new password is required',
            400
        )
    }

    const tokenHash = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex')

    const rows = await db
        .select({
            tokenId: passwordResetTokens.id,
            userId: passwordResetTokens.userId,
            expiresAt: passwordResetTokens.expiresAt,
        })
        .from(passwordResetTokens)
        .where(
            applicationId
                ? and(
                    eq(passwordResetTokens.tokenHash, tokenHash),
                    or(
                        isNull(passwordResetTokens.applicationId),
                        eq(passwordResetTokens.applicationId, applicationId),
                    ),
                )
                : eq(passwordResetTokens.tokenHash, tokenHash),
        )
        .limit(1)

    if (rows.length === 0) {
        throw new AuthError(
            'INVALID_TOKEN',
            'Reset token is invalid',
            401
        )
    }

    const row = rows[0]

    if (row.expiresAt && row.expiresAt < new Date()) {
        throw new AuthError(
            'TOKEN_EXPIRED',
            'Reset token has expired',
            401
        )
    }

    const passwordHash = await hashPassword(newPassword)
    await enforcePasswordHistory(row.userId, newPassword, passwordHash)

    const accessTokens = await db
        .select({ tokenHash: authTokens.tokenHash })
        .from(authTokens)
        .where(
            and(
                eq(authTokens.userId, row.userId),
                eq(authTokens.tokenType, 'access'),
            ),
        )

    await db.transaction(async (tx) => {
        // Update current password
        await tx
            .update(userAuthLocal)
            .set({
                passwordHash,
                isEnabled: true,
            })
            .where(eq(userAuthLocal.userId, row.userId))

        // Revoke all auth tokens
        await tx
            .update(authTokens)
            .set({
                revokedAt: new Date(),
            })
            .where(eq(authTokens.userId, row.userId))

        // Delete reset token (single-use)
        await tx
            .delete(passwordResetTokens)
            .where(eq(passwordResetTokens.id, row.tokenId))
    })

    for (const accessToken of accessTokens) {
        try {
            await cacheStore.del(`auth:token:${accessToken.tokenHash}`)
        } catch (error) {
            logger.error(
                'Password reset completed, but access-token cache invalidation failed:',
                error,
            )
            throw new AuthError(
                'TOKEN_CACHE_INVALIDATION_FAILED',
                'Password reset completed, but active token cache invalidation failed',
                500,
            )
        }
    }
}
