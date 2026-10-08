/**
 * @myDocBlock v2.3
 * @file PUT.ts
 * @external
 * @module routes/v1/auth/passreset/verify
 * @tag auth, password, reset
 * @version 1.0.2
 * @author william.r.oak@gmail.com
 * @path /v1/auth/passreset/verify
 * @summary Verify a password reset token.
 * @description
 * Validates a password reset token without changing user state. When
 * app_key is supplied, the token must belong to that application's scope;
 * legacy unscoped tokens remain compatible when app_key is omitted.
 * Used by clients to confirm token validity before submitting
 * a new password.
 *
 * @requestExample
 * {
 *   "token": "opaque-reset-token",
 *   "app_key": "bill.iworkhere.com"
 * }
 *
 * @response
 * {
 *   "valid": true
 * }
 *
 * @requires
 * {
 *   "services": [
 *     "passwordResetService",
 *     "authContext"
 *   ]
 * }
 */

import type { Request, Response } from 'express';
import { z } from 'zod';

import { AuthError } from '@services/auth/authContext';
import { resolveAuthContext } from '@services/auth/authContext';
import { verifyPasswordResetToken } from '@services/auth/passwordResetService';

export const schema = {
  body: z.object({
    token: z.string().trim().min(1),
    app_key: z.string().trim().min(1).optional(),
  }),
};

export default async function PUT(req: Request, res: Response): Promise<void> {
  try {
    const body =
      (req.validated?.body as z.infer<typeof schema.body>) ?? req.body;

    // Simple guard clause for manual/unit test execution
    if (!body || typeof body.token !== 'string' || !body.token.trim()) {
      res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'Invalid request body',
      });
      return;
    }

    const authContext = body.app_key
      ? await resolveAuthContext(body)
      : undefined;

    if (authContext) {
      await verifyPasswordResetToken(body.token, authContext.applicationId);
    } else {
      await verifyPasswordResetToken(body.token);
    }

    res.status(200).json({ valid: true });
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(err.httpStatus).json({
        error: err.code,
        message: err.message,
      });
      return;
    }

    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
}
