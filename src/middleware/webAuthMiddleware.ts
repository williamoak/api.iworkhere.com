/**
 * @myDocBlock v2.3
 * @file src/middleware/webAuthMiddleware.ts
 * @internal
 * @module auth
 * @tag middleware
 * @version 1.0.2
 * @author william.r.oak@gmail.com
 * @path @middleware/webAuthMiddleware.ts
 * @summary Middleware to authenticate web requests using 'auth_token' cookie.
 * @description Validates the token against the database and attaches the user ID to the request object if valid.
 * @requestExample none
 * @response none
 * @requires {
 *   "database": "authTokens table"
 * }
 */

import type { Request, Response, NextFunction } from 'express';
import { configGet } from '@helpers/config';
import crypto from 'crypto';
const DEBUG = configGet('DEBUG');
import { db } from '@services/dbService';
import { authTokens } from '@db/schema';
import { and, eq, gt, isNull } from 'drizzle-orm';

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
export async function webAuthMiddleware(req: Request, _res: Response, next: NextFunction) {
  if (DEBUG) console.log('[DEBUG] [webAuthMiddleware] cookies:', req.cookies);
  const token = req.cookies.auth_token;

  if (!token) {
    req.auth = undefined;
    return next();
  }

  try {
    const tokenHash = hashToken(token);
    const now = new Date();

    const rows = await db
      .select({ userId: authTokens.userId })
      .from(authTokens)
      .where(
        and(
          eq(authTokens.tokenHash, tokenHash),
          eq(authTokens.tokenType, 'access'),
          isNull(authTokens.revokedAt),
          gt(authTokens.expiresAt, now),
        ),
      )
      .limit(1);

    if (rows.length > 0) {
      req.auth = { userId: rows[0].userId };
    } else {
      req.auth = undefined;
    }
  } catch (err) {
    console.error('Web Auth Error:', err);
    req.auth = undefined;
  }
  
  next();
}
