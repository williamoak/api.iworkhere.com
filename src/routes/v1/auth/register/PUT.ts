/**
 * @myDocBlock v2.3
 * @file PUT.ts
 * @external
 * @module routes/v1/auth/register
 * @tag auth, register
 * @version 1.0.1
 * @author william.r.oak@gmail.com
 * @path /v1/auth/register
 * @summary Register a new user for an application.
 * @description
 * Creates a new user identity and local authentication credentials,
 * associates the user with an application, and enforces password
 * security rules. The user is created in a pending state until
 * email verification is completed.
 */

import type { IncomingMessage, ServerResponse } from 'http'

import { resolveAuthContext, AuthError } from '@services/auth/authContext'
import { hashPassword, enforcePasswordHistory } from '@services/auth/passwordService'
import { issueEmailVerificationToken } from '@services/auth/emailVerificationService' // NEW
import { db } from '@services/dbService'
import {
    users,
    userAuthLocal,
    userApplications,
} from '@db/schema'

import { v7 as uuidv7 } from 'uuid'

export default async function PUT(
    req: IncomingMessage,
    res: ServerResponse
): Promise<void> {
    try {
        const body = (req as any).body
        const { username, email, password } = body ?? {}

        // Validate request BEFORE services
        if (!username || !email || !password) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(
                JSON.stringify({
                    error: 'INVALID_REQUEST',
                    message: 'username, email, and password are required',
                })
            )
            return
        }

        // Resolve application context
        const { applicationId } = await resolveAuthContext(body)

        const passwordHash = await hashPassword(password)
        const userId = uuidv7()

        // Create user + auth + app access + email verification atomically
        await db.transaction(async (tx) => {
            await tx.insert(users).values({
                id: userId,
                username,
                email,
                statusCode: 'pending',
            })

            await tx.insert(userAuthLocal).values({
                userId,
                passwordHash,
                isEnabled: true,
            })

            await enforcePasswordHistory(userId, passwordHash)

            await tx.insert(userApplications).values({
                userId,
                applicationId,
                role: 'user',
                isEnabled: true,
            })

            // 🔐 Issue email verification token (NEW)
            await issueEmailVerificationToken({
                userId,
                email,
                tx,
            })
        })

        res.statusCode = 201
        res.setHeader('Content-Type', 'application/json')
        res.end(
            JSON.stringify({
                user: {
                    id: userId,
                    username,
                    email,
                    status: 'pending',
                },
            })
        )
    } catch (err) {
        if (err instanceof AuthError) {
            res.statusCode = err.httpStatus
            res.setHeader('Content-Type', 'application/json')
            res.end(
                JSON.stringify({
                    error: err.code,
                    message: err.message,
                })
            )
            return
        }

        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(
            JSON.stringify({
                error: 'INTERNAL_ERROR',
                message: 'An unexpected error occurred',
            })
        )
    }
}
