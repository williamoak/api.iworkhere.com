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

import type { Request, Response } from 'express';

import { resolveAuthContext, AuthError } from '@services/auth/authContext';
import {
  hashPassword,
  enforcePasswordHistory,
} from '@services/auth/passwordService';
import { issueEmailVerificationToken } from '@services/auth/emailVerificationService';
import { db } from '@services/dbService';
import { users, userAuthLocal, userApplications } from '@db/schema';

import { v7 as uuidv7 } from 'uuid';

import {
  registrationBodySchema,
  type RegistrationBody,
} from '@validation/auth';

export const schema = {
  body: registrationBodySchema,
};

export default async function PUT(req: Request, res: Response): Promise<void> {
  try {
    const body =
      (req.validated?.body as RegistrationBody) ??
      (req.body as RegistrationBody);

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

// ... existing code ...
    res.status(201).json({
      user: {
        id: userId,
        username,
        email,
        status: 'pending',
      },
    });
  } catch (err: any) {
    if (err instanceof AuthError) {
      res.status(err.httpStatus).json({
        error: err.code,
        message: err.message,
      });
      return;
    }

    // Handle unique constraint violations (PostgreSQL/CockroachDB error code 23505)
    const DB_ERROR = '23505';
    if (err?.code === DB_ERROR) {
      // Identify which constraint failed to give a precise error message
      const constraintName = err.constraint || err.message || '';

      if (constraintName.includes('email')) {
        res.status(409).json({
          error: 'EMAIL_TAKEN',
          message: 'An account with this email already exists',
        });
        return;
      }

      if (constraintName.includes('username')) {
        res.status(409).json({
          error: 'USERNAME_TAKEN',
          message: 'This username is already taken',
        });
        return;
      }

      // Fallback if we can't identify the constraint, but we know it's a conflict
      res.status(409).json({
        error: 'CONFLICT',
        message: 'A conflict occurred with existing data',
      });
      return;
    }

    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
}