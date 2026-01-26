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
 * verification, and completion. All reset tokens are single-use,
 * time-limited, and stored hashed only.
 */

import crypto from 'crypto'
import { v7 as uuidv7 } from 'uuid'
import { eq, or } from 'drizzle-orm'

import { db } from '@services/dbService'
import { AuthError } from '@services/auth/authContext'
import { configGet } from '@helpers/config'
import {
    users,
    passwordResetTokens,
    userAuthLocal,
    userPasswordHistory,
    authTokens,
} from '@db/schema'
import { hashPassword } from '@services/auth/passwordService'

/**
 * Configuration
 */
const RESET_TOKEN_TTL_SECONDS = Number(
    configGet('RESET_TOKEN_TTL_SECONDS')
)

if (!Number.isFinite(RESET_TOKEN_TTL_SECONDS) || RESET_TOKEN_TTL_SECONDS <= 0) {
    throw new Error('RESET_TOKEN_TTL_SECONDS must be a positive number')
}

/**
 * Generate secure random token
 */
function generateToken(): { raw: string; hash: string } {
    const raw = crypto.randomBytes(32).toString('hex')
    const hash = crypto.createHash('sha256').update(raw).digest('hex')
    return { raw, hash }
}

/**
 * Initiate password reset
 */
export async function initiatePasswordReset(
    identifier: string
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
        tokenHash: hash,
        expiresAt,
    })

    return { token: raw }
}

/**
 * Verify password reset token
 */
export async function verifyPasswordResetToken(
    token: string
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
        .where(eq(passwordResetTokens.tokenHash, tokenHash))
        .limit(1)

    if (rows.length === 0) {
        throw new AuthError(
            'TOKEN_INVALID',
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
    newPassword: string
): Promise<void> {
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
        .where(eq(passwordResetTokens.tokenHash, tokenHash))
        .limit(1)

    if (rows.length === 0) {
        throw new AuthError(
            'TOKEN_INVALID',
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

    await db.transaction(async (tx) => {
        // Update current password
        await tx
            .update(userAuthLocal)
            .set({
                passwordHash,
                isEnabled: true,
            })
            .where(eq(userAuthLocal.userId, row.userId))

        // Insert password history
        await tx.insert(userPasswordHistory).values({
            userId: row.userId,
            passwordHash,
        })

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
}
