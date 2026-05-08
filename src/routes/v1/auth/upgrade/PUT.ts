/**
 * @myDocBlock v2.3
 * @file PUT.ts
 * @external
 * @module routes/v1/auth/upgrade
 * @tag auth, upgrade
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path /v1/auth/upgrade
 * @summary Upgrade an OAuth-only account to a full local account.
 * @description
 * Upgrades a Google-authenticated account by adding a username and local
 * password credentials. This sets the user status to 'active' and allows
 * subsequent password-based logins.
 *
 * @requestExample
 * {
 *   "username": "newusername",
 *   "password": "strong-password"
 * }
 *
 * @response
 * {
 *   "user": {
 *     "id": "uuid",
 *     "username": "newusername",
 *     "status": "active"
 *   }
 * }
 *
 * @requires
 * {
 *   "authRequired": true,
 *   "services": [
 *     "passwordService",
 *     "dbService"
 *   ],
 *   "tables": [
 *     "users",
 *     "user_auth_local"
 *   ]
 * }
 */

import type { Request, Response } from 'express'
import { z } from 'zod'
import { eq } from 'drizzle-orm'

import { hashPassword, enforcePasswordHistory } from '@services/auth/passwordService'
import { db } from '@services/dbService'
import { users, userAuthLocal } from '@db/schema'

export const authRequired = true

export const schema = {
  body: z.object({
    username: z.string().trim().min(3),
    password: z.string().min(8),
  }),
}

export default async function PUT(req: Request, res: Response): Promise<void> {
  const userId = (req as any).auth?.userId
  if (!userId) {
    res.status(401).json({ error: 'UNAUTHORIZED' })
    return
  }

  const { username, password } = req.validated?.body as z.infer<typeof schema.body>

  try {
    await db.transaction(async (tx) => {
      // 1. Check if already upgraded
      const existingAuth = await tx.query.userAuthLocal.findFirst({
        where: eq(userAuthLocal.userId, userId)
      })

      if (existingAuth) {
        throw new Error('ACCOUNT_ALREADY_UPGRADED')
      }

      // 2. Hash and enforce history
      const passwordHash = await hashPassword(password)
      await enforcePasswordHistory(userId, password, passwordHash)

      // 3. Update username and status
      await tx.update(users)
        .set({ username, statusCode: 'active' })
        .where(eq(users.id, userId))

      // 4. Create local auth record
      await tx.insert(userAuthLocal).values({
        userId,
        passwordHash,
        isEnabled: true,
      })
    })

    res.status(200).json({
      user: {
        id: userId,
        username,
        status: 'active'
      }
    })
  } catch (err: any) {
    if (err.message === 'ACCOUNT_ALREADY_UPGRADED') {
      res.status(400).json({ error: 'ALREADY_UPGRADED', message: 'Account is already upgraded.' })
      return
    }
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message })
  }
}
