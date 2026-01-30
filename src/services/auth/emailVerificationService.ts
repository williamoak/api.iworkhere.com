/**
 * @myDocBlock v2.3
 * @file emailVerificationService.ts
 * @internal
 * @module services/auth/emailVerificationService
 * @tag auth, email, verification
 * @version 1.1.2
 * @path none
 * @summary Issues and verifies email ownership tokens.
 * @description
 * Handles issuance, verification, and resending of email verification tokens.
 * Tokens are stored hashed, are single-use, application-aware, and time-limited.
 */

import crypto from 'crypto'
import { and, eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { PgTransaction } from 'drizzle-orm/pg-core'

import { db } from '@services/dbService'
import { configGet } from '@helpers/config'
import { AuthError } from '@services/auth/authContext'
import {
    users,
    userApplications,
    emailVerificationTokens,
} from '@db/schema'

import { v7 as uuidv7 } from 'uuid'

/**
 * Shared executor type that supports both db and tx.
 */
type DbExecutor =
    | NodePgDatabase<any>
    | PgTransaction<any, any, any>

/**
 * Issue an email verification token for a user.
 * Must be called inside an existing transaction if provided.
 */
export async function issueEmailVerificationToken(params: {
    userId: string
    email: string
    tx?: DbExecutor
}): Promise<{ token: string }> {
    const { userId, email, tx = db } = params

    if (!userId || !email) {
        throw new AuthError(
            'INVALID_REQUEST',
            'userId and email are required',
            400
        )
    }

    const ttlSeconds = Number(
        configGet('EMAIL_VERIFY_TOKEN_TTL_SECONDS')
    )

    if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
        throw new Error(
            'EMAIL_VERIFY_TOKEN_TTL_SECONDS misconfigured'
        )
    }

    const rawToken = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto
        .createHash('sha256')
        .update(rawToken)
        .digest('hex')

    const expiresAt = new Date(
        Date.now() + ttlSeconds * 1000
    )

    await tx.insert(emailVerificationTokens).values({
        id: uuidv7(),
        userId,
        tokenHash,
        expiresAt,
    })

    return { token: rawToken }
}

/**
 * Verify an email verification token and activate the user.
 */
export async function verifyEmailToken(token: string): Promise<{
    id: string
    email: string
}> {
    if (!token || token.trim() === '') {
        throw new AuthError(
            'INVALID_TOKEN',
            'Verification token is required',
            400
        )
    }

    const tokenHash = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex')

    const rows = await db
        .select({
            userId: users.id,
            email: users.email,
            tokenId: emailVerificationTokens.id,
            expiresAt: emailVerificationTokens.expiresAt,
        })
        .from(emailVerificationTokens)
        .innerJoin(
            users,
            eq(users.id, emailVerificationTokens.userId)
        )
        .where(eq(emailVerificationTokens.tokenHash, tokenHash))
        .limit(1)

    if (rows.length === 0) {
        throw new AuthError(
            'INVALID_TOKEN',
            'Verification token is invalid',
            401
        )
    }

    const row = rows[0]

    if (row.expiresAt && row.expiresAt < new Date()) {
        throw new AuthError(
            'TOKEN_EXPIRED',
            'Verification token has expired',
            401
        )
    }

    await db.transaction(async (tx) => {
        await tx
            .update(users)
            .set({
                statusCode: 'active',
                emailVerifiedAt: new Date(),
            })
            .where(eq(users.id, row.userId))

        await tx
            .delete(emailVerificationTokens)
            .where(eq(emailVerificationTokens.id, row.tokenId))
    })

    return {
        id: row.userId,
        email: row.email!,
    }
}

/**
 * Resend an email verification token for a pending user.
 * This function is intentionally non-enumerating.
 */
export async function resendEmailVerificationToken(params: {
    applicationId: string
    email: string
}): Promise<void> {
    const { applicationId, email } = params

    if (!email || !email.trim()) {
        return
    }

    const rows = await db
        .select({
            userId: users.id,
            status: users.statusCode,
        })
        .from(users)
        .innerJoin(
            userApplications,
            eq(userApplications.userId, users.id)
        )
        .where(
            and(
                eq(users.email, email.trim()),
                eq(userApplications.applicationId, applicationId),
                eq(userApplications.isEnabled, true)
            )
        )
        .limit(1)

    if (rows.length === 0) {
        return
    }

    const user = rows[0]

    if (user.status !== 'pending') {
        return
    }

    await db.transaction(async (tx) => {
        await tx
            .delete(emailVerificationTokens)
            .where(eq(emailVerificationTokens.userId, user.userId))

        await issueEmailVerificationToken({
            userId: user.userId,
            email,
            tx,
        })
    })
}
