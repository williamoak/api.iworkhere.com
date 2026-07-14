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
import { sendEmail } from '@helpers/mailer'
import {
    users,
    userApplications,
    emailVerificationTokens,
} from '@db/schema'

import { v7 as uuidv7 } from 'uuid'

/**
 * Shared executor type that supports both db and tx.
 */
export type DbExecutor =
    | NodePgDatabase<any>
    | PgTransaction<any, any, any>

/**
 * Issue an email verification token for a user.
 * Must be called inside an existing transaction if provided.
 */
export async function issueEmailVerificationToken(params: {
    userId: string
    applicationId: string
    email: string
    tx?: DbExecutor
}): Promise<{ token: string; email: string }> {
    const { userId, applicationId, email, tx = db } = params

    if (!userId || !applicationId || !email) {
        throw new AuthError(
            'INVALID_REQUEST',
            'userId, applicationId and email are required',
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

    try {
        console.log('[emailVerificationService] Inserting token into DB...', { userId, applicationId, tokenHash });
        await tx.insert(emailVerificationTokens).values({
            id: uuidv7(),
            userId,
            applicationId,
            tokenHash,
            expiresAt,
        });
        console.log('[emailVerificationService] Token inserted successfully.');
    } catch (err) {
        console.error('[emailVerificationService] Token insertion failed:', err);
        throw err;
    }

    return { token: rawToken, email }
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

    console.log('[emailVerificationService] Verifying tokenHash:', tokenHash);

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

    console.log('[emailVerificationService] Query result length:', rows.length);

    if (rows.length === 0) {
        console.log('[emailVerificationService] Token not found in DB');
        throw new AuthError(
            'INVALID_TOKEN',
            'Verification token is invalid',
            401
        )
    }

    const row = rows[0]
    console.log('[emailVerificationService] Token found, userId:', row.userId);

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

        /*
        await tx
            .delete(emailVerificationTokens)
            .where(eq(emailVerificationTokens.id, row.tokenId))
        */
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
    email?: string
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

    let verificationToken = '';
    await db.transaction(async (tx) => {
        await tx
            .delete(emailVerificationTokens)
            .where(eq(emailVerificationTokens.userId, user.userId))

        const tokenResult = await issueEmailVerificationToken({
            userId: user.userId,
            applicationId,
            email,
            tx,
        })
        verificationToken = tokenResult.token;
    })

    // Send verification email after token creation
    // Failures are logged but don't prevent resend response
    // Intentionally not awaiting this to avoid blocking the request
    sendVerificationEmail({
        email,
        token: verificationToken,
        userId: user.userId,
    }).catch(err => {
        console.error('[resend] Background email send failed:', err);
    });
}

export async function sendVerificationEmail(params: {
    email: string;
    token: string;
    userId?: string;
}): Promise<void> {
    const { email, token, userId } = params;
    const appUrl = configGet('APP_URL');
    const verifyUrl = `${appUrl}/v1/auth/emailverify?token=${token}`;

    await sendEmail({
        to: email,
        subject: 'Verify your email address',
        text: `Please verify your email address by visiting this link: ${verifyUrl}`,
        html: `<p>Please verify your email address by clicking the link below:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p>`,
        throwOnError: false,
        auditUserId: userId,
        auditType: 'verification',
    });
}