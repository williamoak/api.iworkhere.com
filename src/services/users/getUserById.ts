/**
 * @myDocBlock
 * @file getUserById.ts
 * @internal
 * @module services/users
 * @tag users
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path @services/users/getUserById
 * @summary Fetch a single user by id for auth checks.
 * @description
 * Loads a fresh user snapshot for authentication gates without caching.
 * Returns null when the user does not exist.
 * @requestExample
 * {
 *   "userId": "uuidv7"
 * }
 * @response
 * {
 *   "id": "uuidv7",
 *   "username": "string",
 *   "email": "string | null",
 *   "status": "string",
 *   "eulaAccepted": null
 * }
 * @requires
 * {
 *   "tables": ["users"],
 *   "services": ["@services/dbService"]
 * }
 */
import { db } from '@services/dbService'
import { users } from '@db/schema'
import { eq } from 'drizzle-orm'

export type AuthUserRecord = {
    id: string
    username: string
    email: string | null
    status: string
    eulaAccepted: boolean | null
}

export async function getUserById(
    userId: string
): Promise<AuthUserRecord | null> {
    if (!userId) return null

    const rows = await db
        .select({
            id: users.id,
            username: users.username,
            email: users.email,
            status: users.statusCode,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)

    if (rows.length === 0) return null

    const row = rows[0]

    return {
        id: row.id,
        username: row.username,
        email: row.email ?? null,
        status: row.status,
        eulaAccepted: null,
    }
}

