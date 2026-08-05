import { logger } from '@helpers/logger';

﻿/**
 * @myDocBlock
 * @file authMiddleware.ts
 * @internal
 * @module Middleware
 * @tag api, auth, debug
 * @version 1.0.5
 * @author william.r.oak@gmail.com
 * @path src/middleware/authMiddleware.ts
 * @summary Access token authentication middleware (instrumented).
 * @description
 *   Checks Authorization: Bearer <token>
 *   - tokenHash = sha256(token)
 *   - SELECT ... FROM auth_tokens WHERE
 *        tokenHash match, tokenType='access', revokedAt IS NULL, expiresAt > now
 *   - Attaches req.auth.userId on success
 *
 *   DEBUG NOTES
 *   - Enable with AUTH_MW_DEBUG=1
 *   - In debug mode, this middleware returns 401 debug metadata (reqId/reason)
 *     and emits debug response headers.
 *   - Raw token values are never logged or returned.
 * @query {}
 * @requestExample none
 * @response none
 * @requires {
 *   "database": "authTokens table"
 * }
 */

import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

import { db } from '@services/dbService';
import { authTokens } from '@db/schema';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { cacheStore } from '@cache/cacheStore';

const BEARER_PREFIX = 'bearer ';

function isDebug(): boolean {
  return process.env.AUTH_MW_DEBUG === '1';
}
;
function dbg(
  reqId: string,
  phase: string,
  fields: Record<string, unknown> = {},
): void {
  if (!isDebug()) return;

  logger.log(
    JSON.stringify({
      tag: 'auth.middleware',
      reqId,
      phase,
      t: new Date().toISOString(),
      ...fields,
    }),
  );
}

function extractBearerToken(req: Request): string | null {
  const header = req.get('authorization');
  if (!header) return null;

  const trimmed = header.trim();
  if (!trimmed.toLowerCase().startsWith(BEARER_PREFIX)) {
    return null;
  }

  const token = trimmed.slice(BEARER_PREFIX.length).trim();
  return token || null;
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

import { executeTenantSpecific } from '@middleware/tenantResolver';

export function authMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    const reqId =
      (req.get('x-request-id')?.trim() || '').slice(0, 128) ||
      crypto.randomUUID();

    function reject401(reason: string, extra: Record<string, unknown> = {}) {
      if (isDebug()) {
        res.setHeader('x-debug-req-id', reqId);
        res.setHeader('x-debug-auth-reason', reason);
      }

      dbg(reqId, 'reject', {
        reason,
        durationMs: Date.now() - start,
        ...extra,
      });

      if (isDebug()) {
        return res.status(401).json({
          error: 'UNAUTHORIZED',
          debug: {
            reqId,
            reason,
            ...extra,
          },
        });
      }

      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }

    try {
      const authorizationRaw = req.get('authorization');
      const token = extractBearerToken(req);

      dbg(reqId, 'enter', {
        method: req.method,
        url: req.url,
        ip: req.ip,
        tokenPresent: Boolean(token),
      });

      if (!token) {
        return reject401('MISSING_TOKEN', {
            hasAuthorization: Boolean(authorizationRaw),
        });
      } else {
        const tokenHash = hashToken(token);
        const cacheKey = `auth:token:${tokenHash}`;
        const now = new Date();

        // Check cache first
        const cachedUserId = await cacheStore.get<string>(cacheKey);
        if (cachedUserId) {
          dbg(reqId, 'cache_hit', {
            tokenHash,
            cachedUserId,
          });
          req.auth = { userId: cachedUserId };
        } else {
          dbg(reqId, 'cache_miss', {
            tokenHash,
            now: now.toISOString(),
          });

          const rows = await db
            .select({ userId: authTokens.userId, expiresAt: authTokens.expiresAt })
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

          dbg(reqId, 'db.result', {
            rowsLength: rows.length,
          });

          if (rows.length > 0) {
            const userId = rows[0].userId;
            const expiresAt = rows[0].expiresAt;

            // Set cache if we have an expiration
            if (expiresAt) {
              const ttl = Math.max(0, expiresAt.getTime() - now.getTime());
              await cacheStore.set(cacheKey, userId, ttl);
            }

            req.auth = { userId };
            res.locals.visitUserId = userId; // Capture for logging
          }
        }
      }

      // 2. Execute tenant-specific additive middleware
      const tenant = (req as any).tenant;
      await executeTenantSpecific(tenant, 'authMiddleware', req, res, () => {});

      if (!req.auth) {
        return reject401('TOKEN_NOT_FOUND_OR_EXPIRED_OR_REVOKED_OR_WRONG_TYPE', {
          tokenPresent: Boolean(token),
        });
      }

      dbg(reqId, 'success', {
        attachedAuth: req.auth,
        durationMs: Date.now() - start,
      });

      return next();
    } catch (err) {
      dbg(reqId, 'error', {
        name: err instanceof Error ? err.name : undefined,
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        durationMs: Date.now() - start,
      });
      return next(err);
    }
  };
}
