import { logger } from '@helpers/logger';

/**
 * @myDocBlock
 * @file webAuthMiddleware.ts
 * @internal
 * @module auth
 * @tag middleware
 * @version 1.0.3
 * @author william.r.oak@gmail.com
 * @path src/middleware/webAuthMiddleware.ts
 * @summary Middleware to authenticate web requests using 'auth_token' cookie or Bearer header.
 * @description
 *   Validates the token against the database and attaches the user ID
 *   to the request object if valid. Supports multiple authentication
 *   sources for cross-subdomain compatibility.
 * @requestExample none
 * @response none
 * @requires {
 *   "database": "authTokens table"
 * }
 */

import type { Request, Response, NextFunction } from 'express';
;
import crypto from 'crypto';
import { db } from '@services/dbService';
import { authTokens } from '@db/schema';
import { and, eq, gt, isNull } from 'drizzle-orm';

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
import { resolveTenantMiddleware } from '@middleware/tenantResolver';

export async function webAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const tenant = (req as any).tenant;
  const handled = await resolveTenantMiddleware(tenant, 'webAuthMiddleware', req, res, next);
  if (handled) return;

  logger.log('[DEBUG] [webAuthMiddleware] cookies:', req.cookies);
  logger.log('[DEBUG] [webAuthMiddleware] authorization header:', req.headers.authorization);
  logger.log('[DEBUG] [webAuthMiddleware] All headers:', JSON.stringify(req.headers, null, 2));
  let token = req.cookies.auth_token;
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }
  if (!token) {
    token = req.query.auth_token as string;
  }

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
      logger.log('[DEBUG] [webAuthMiddleware] auth successful for user:', rows[0].userId);
      req.auth = { userId: rows[0].userId };
    } else {
      logger.log('[DEBUG] [webAuthMiddleware] auth failed - token not found or invalid');
      req.auth = undefined;
    }
  } catch (err) {
    logger.error('Web Auth Error:', err);
    req.auth = undefined;
  }
  
  next();
}
