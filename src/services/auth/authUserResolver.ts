/**
 * @myDocBlock
 * @file authUserResolver.ts
 * @internal
 * @module services/auth
 * @tag auth, user, application-access
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path src/services/auth/authUserResolver.ts
 * @summary Resolves and enforces user identity and application access.
 * @description
 * Resolves a user by identifier (username or email), enforces user status,
 * and verifies that the user has enabled access to the specified application.
 *
 * This module intentionally does not perform password verification or token
 * handling. Its sole responsibility is identity and authorization resolution
 * within an application scope.
 *
 * All failures throw typed AuthError instances to be translated by route
 * handlers into HTTP responses.
 *
 * @requestExample
 * {
 *   "identifier": "bill"
 * }
 *
 * @response
 * {
 *   "userId": "uuid",
 *   "username": "bill",
 *   "email": "william.r.oak@gmail.com",
 *   "role": "owner"
 * }
 *
 * @requires
 * {
 *   "tables": [
 *     "users",
 *     "user_applications"
 *   ],
 *   "services": [
 *     "@services/dbService"
 *   ]
 * }
 *
 * @internal
 */

import { db } from '@services/dbService'
import { users, userApplications } from '@db/schema'
import { and, eq, or } from 'drizzle-orm'
import { AuthError } from './authContext'

export type ResolvedUser = {
    userId: string
    username: string
    email: string
    role: string
}

/**
 * Resolve a user by identifier and enforce application access.
 *
 * Enforcement order:
 * 1. identifier present
 * 2. user exists (username OR email)
 * 3. user status is active
 * 4. user has enabled access to application
 */
export async function resolveUserForApplication(
    identifier: unknown,
    applicationId: string
): Promise<ResolvedUser> {
    if (typeof identifier !== 'string' || !identifier.trim()) {
        throw new AuthError(
            'INVALID_CREDENTIALS',
            'Invalid credentials',
            401
        )
    }

    const value = identifier.trim()

    const rows = await db
        .select({
            userId: users.id,
            username: users.username,
            email: users.email,
            status: users.statusCode,
            role: userApplications.role,
            appEnabled: userApplications.isEnabled,
        })
        .from(users)
        .innerJoin(
            userApplications,
            eq(userApplications.userId, users.id)
        )
        .where(
            and(
                or(
                    eq(users.username, value),
                    eq(users.email, value)
                ),
                eq(userApplications.applicationId, applicationId)
            )
        )
        .limit(1)

    if (rows.length === 0) {
        throw new AuthError(
            'INVALID_CREDENTIALS',
            'Invalid credentials',
            401
        )
    }

    const row = rows[0]

    if (row.status !== 'active') {
        throw new AuthError(
            'USER_DISABLED',
            'User account is disabled',
            403
        )
    }

    if (!row.appEnabled) {
        throw new AuthError(
            'INVALID_CREDENTIALS',
            'Invalid credentials',
            401
        )
    }

    if (!row.email) {
        throw new AuthError(
            'USER_EMAIL_MISSING',
            'User account is not properly configured',
            500
        )
    }

    return {
        userId: row.userId,
        username: row.username,
        email: row.email,
        role: row.role,
    }
}
