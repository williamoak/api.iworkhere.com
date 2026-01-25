/**
 * @myDocBlock
 * @file passwordService.ts
 * @internal
 * @module services/auth
 * @tag auth, password, security
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path src/services/auth/passwordService.ts
 * @summary Centralized password verification, hashing, and history enforcement.
 * @description
 * Provides the sole implementation for password handling within the
 * authentication domain. This module verifies plaintext passwords against
 * stored bcrypt hashes, hashes new passwords, and enforces password reuse
 * prevention using the user_password_history table.
 *
 * All password-related security guarantees are centralized here to ensure
 * consistency, auditability, and correctness.
 *
 * This module throws typed AuthError instances and does not perform any HTTP
 * response handling.
 *
 * @requires
 * {
 *   "tables": [
 *     "user_auth_local",
 *     "user_password_history"
 *   ],
 *   "services": [
 *     "@services/dbService"
 *   ],
 *   "libraries": [
 *     "bcryptjs"
 *   ]
 * }
 *
 * @internal
 */

import bcrypt from 'bcryptjs'
import { db } from '@services/dbService'
import {
    userAuthLocal,
    userPasswordHistory,
} from '@db/schema'
import { eq } from 'drizzle-orm'
import { AuthError } from './authContext'

const BCRYPT_ROUNDS = 12

/**
 * Verify a plaintext password against the user's current password hash.
 */
export async function verifyPassword(
    userId: string,
    plaintextPassword: unknown
): Promise<void> {
    if (typeof plaintextPassword !== 'string' || !plaintextPassword) {
        throw new AuthError(
            'INVALID_CREDENTIALS',
            'Invalid credentials',
            401
        )
    }

    const rows = await db
        .select({
            passwordHash: userAuthLocal.passwordHash,
            isEnabled: userAuthLocal.isEnabled,
        })
        .from(userAuthLocal)
        .where(eq(userAuthLocal.userId, userId))
        .limit(1)

    if (rows.length === 0 || !rows[0].isEnabled) {
        throw new AuthError(
            'INVALID_CREDENTIALS',
            'Invalid credentials',
            401
        )
    }

    const match = await bcrypt.compare(
        plaintextPassword,
        rows[0].passwordHash
    )

    if (!match) {
        throw new AuthError(
            'INVALID_CREDENTIALS',
            'Invalid credentials',
            401
        )
    }
}

/**
 * Hash a plaintext password using bcrypt.
 */
export async function hashPassword(
    plaintextPassword: unknown
): Promise<string> {
    if (typeof plaintextPassword !== 'string' || !plaintextPassword) {
        throw new AuthError(
            'PASSWORD_INVALID',
            'Password is invalid',
            400
        )
    }

    return bcrypt.hash(plaintextPassword, BCRYPT_ROUNDS)
}

/**
 * Enforce password history rules and record the new password hash.
 *
 * This prevents password reuse by comparing the new hash against all
 * historical hashes for the user.
 */
export async function enforcePasswordHistory(
    userId: string,
    newPasswordHash: string
): Promise<void> {
    const rows = await db
        .select({
            passwordHash: userPasswordHistory.passwordHash,
        })
        .from(userPasswordHistory)
        .where(eq(userPasswordHistory.userId, userId))

    for (const row of rows) {
        const reused = await bcrypt.compare(
            newPasswordHash,
            row.passwordHash
        )

        if (reused) {
            throw new AuthError(
                'PASSWORD_REUSE',
                'Password was used previously',
                400
            )
        }
    }

    await db.insert(userPasswordHistory).values({
        userId,
        passwordHash: newPasswordHash,
    })
}
