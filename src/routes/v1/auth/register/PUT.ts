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
 *
 * @query none
 *
 * @requestExample
 * {
 *   "app_key": "example-app-key",
 *   "username": "bill",
 *   "email": "bill@example.com",
 *   "password": "plaintext-password"
 * }
 *
 * @response
 * {
 *   "user": {
 *     "id": "uuid",
 *     "username": "bill",
 *     "email": "bill@example.com",
 *     "status": "pending"
 *   }
 * }
 *
 * @requires
 * {
 *   "services": [
 *     "authContext",
 *     "passwordService",
 *     "emailVerificationService",
 *     "dbService"
 *   ],
 *   "tables": [
 *     "users",
 *     "user_auth_local",
 *     "user_applications",
 *     "email_verification_tokens"
 *   ]
 * }
 */

import type { Request, Response } from 'express'
import { z } from 'zod'

import { resolveAuthContext, AuthError } from '@services/auth/authContext'
import {
    hashPassword,
    enforcePasswordHistory,
} from '@services/auth/passwordService'
import { issueEmailVerificationToken } from '@services/auth/emailVerificationService'
import { db } from '@services/dbService'
import { users, userAuthLocal, userApplications } from '@db/schema'

import { v7 as uuidv7 } from 'uuid'

export const schema = {
    body: z.object({
        app_key: z.string().trim().min(1),
        username: z.string().trim().min(1),
        email: z.string().trim().email(),
        password: z.string().min(1),
    }),
}

export default async function PUT(req: Request, res: Response): Promise<void> {
    try {
      const body =
        (req.validated?.body as z.infer<typeof schema.body>) ?? req.body;
      const { username, email, password } = body;

      // Resolve application context
      const { applicationId } = await resolveAuthContext(body);

      const passwordHash = await hashPassword(password);
      const userId = uuidv7();

      // Create user + auth + app access + email verification atomically
      await db.transaction(async (tx) => {
        await tx.insert(users).values({
          id: userId,
          username,
          email,
          statusCode: 'pending',
        });

        await tx.insert(userAuthLocal).values({
          userId,
          passwordHash,
          isEnabled: true,
        });

        await enforcePasswordHistory(userId, password, passwordHash);

        await tx.insert(userApplications).values({
          userId,
          applicationId,
          role: 'user',
          isEnabled: true,
        });

        await issueEmailVerificationToken({
          userId,
          applicationId,
          email,
          tx,
        });
      });

      res.status(201).json({
        user: {
          id: userId,
          username,
          email,
          status: 'pending',
        },
      });
    } catch (err) {
        if (err instanceof AuthError) {
            res.status(err.httpStatus).json({
                error: err.code,
                message: err.message,
            })
            return
        }

        res.status(500).json({
            error: 'INTERNAL_ERROR',
            message: 'An unexpected error occurred',
        })
    }
}
