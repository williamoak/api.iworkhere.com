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
import {
  issueEmailVerificationToken,
  sendVerificationEmail,
} from '@services/auth/emailVerificationService';
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
    console.log('[registration] Starting registration for:', { username, email });

    // Resolve application context
    console.log('[registration] Resolving auth context...');
    const { applicationId } = await resolveAuthContext(body, req);
    console.log('[registration] Auth context resolved:', { applicationId });

    console.log('[registration] Hashing password...');
    const passwordHash = await hashPassword(password);
    const userId = uuidv7();
    console.log('[registration] Password hashed, userId generated:', { userId });

    // Create user + auth + app access + email verification atomically
    let verificationToken = '';
    console.log('[registration] Entering DB transaction...');
    await db.transaction(async (tx) => {
      console.log('[registration] Inserting user...');
      await tx.insert(users).values({
        id: userId,
        username,
        email,
        statusCode: 'pending',
      });

      console.log('[registration] Inserting auth credentials...');
      await tx.insert(userAuthLocal).values({
        userId,
        passwordHash,
        isEnabled: true,
      });

      console.log('[registration] Enforcing password history...');
      await enforcePasswordHistory(userId, password, passwordHash, tx);

      console.log('[registration] Inserting app association...');
      await tx.insert(userApplications).values({
        userId,
        applicationId,
        role: 'user',
        isEnabled: true,
      });

      console.log('[registration] Issuing email verification token...');
      const tokenResult = await issueEmailVerificationToken({
        userId,
        applicationId,
        email,
        tx,
      });
      verificationToken = tokenResult.token;
      console.log('[registration] Token issued.');
    });
    console.log('[registration] DB transaction committed.');

    // Send verification email after successful registration
    // Failures are logged but don't prevent registration
    // Intentionally not awaiting this to avoid blocking the request
    console.log('[registration] Triggering background email...');
    sendVerificationEmail({
      email,
      token: verificationToken,
      userId,
    }).catch(err => {
      console.error('[registration] Background email send failed:', err);
    });

    res.status(201).json({
      user: {
        id: userId,
        username,
        email,
        status: 'pending',
      },
    });
    console.log('[registration] Registration successful, response sent.');
  } catch (err: any) {
    console.error('Registration failed:', err);
    if (err instanceof AuthError) {
      res.status(err.httpStatus).json({
        error: err.code,
        message: err.message,
      });
      return;
    }

    // Handle unique constraint violations (PostgreSQL/CockroachDB error code 23505)
    const DB_ERROR = '23505';
    const errorCode = err?.code || (err?.cause as any)?.code;
    if (errorCode === DB_ERROR) {
      // Identify which constraint failed to give a precise error message
      const constraintName = err?.constraint || (err?.cause as any)?.constraint || err.message || '';

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