/**
 * @myDocBlock
 * @file applicationOriginResolver.ts
 * @internal
 * @module services/auth
 * @tag auth, application, origin, oauth
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path src/services/auth/applicationOriginResolver.ts
 * @summary Resolves an application context from a caller origin or app key.
 * @description
 * Resolves the consuming application for browser-based authentication flows.
 * The resolver supports an explicit app_key for development/testing and
 * origin-based resolution for production browser consumers.
 *
 * Resolution order:
 * 1. Explicit app_key from query/body.
 * 2. Origin request header.
 * 3. Referer request header origin.
 *
 * Origin-based resolution validates the caller against application_origins and
 * applications, ensuring both the origin and application are enabled before
 * returning an application context.
 *
 * This module throws AuthError instances and does not perform HTTP response
 * handling.
 *
 * @requires
 * {
 *   "tables": [
 *     "applications",
 *     "application_origins"
 *   ],
 *   "services": [
 *     "@services/dbService",
 *     "@services/auth/authContext"
 *   ]
 * }
 *
 * @internal
 */

import type { Request } from 'express';
import { eq } from 'drizzle-orm';

import { applications, applicationOrigins } from '@db/schema';
import { db } from '@services/dbService';
import { AuthError, type AuthContext, resolveAuthContext } from './authContext';

type AppKeySource = {
  app_key?: unknown;
};

function normalizeOrigin(value: string): string {
  const parsed = new URL(value);

  return parsed.origin.toLowerCase();
}

function getExplicitAppKey(req: Request): string | undefined {
  const query = req.query as AppKeySource;
  const body = req.body as AppKeySource | undefined;

  const queryAppKey = query.app_key;
  if (typeof queryAppKey === 'string' && queryAppKey.trim()) {
    return queryAppKey.trim();
  }

  const bodyAppKey = body?.app_key;
  if (typeof bodyAppKey === 'string' && bodyAppKey.trim()) {
    return bodyAppKey.trim();
  }

  return undefined;
}

function getCallerOrigin(req: Request): string | undefined {
  const originHeader = req.get('origin');

  if (originHeader) {
    try {
      return normalizeOrigin(originHeader);
    } catch {
      throw new AuthError('ORIGIN_INVALID', 'Origin header is invalid', 400);
    }
  }

  const refererHeader = req.get('referer');

  if (refererHeader) {
    try {
      return normalizeOrigin(refererHeader);
    } catch {
      throw new AuthError('REFERER_INVALID', 'Referer header is invalid', 400);
    }
  }

  return undefined;
}

async function resolveAuthContextFromOrigin(
  origin: string,
): Promise<AuthContext> {
  const rows = await db
    .select({
      applicationId: applications.id,
      applicationKey: applications.appKey,
      applicationEnabled: applications.isEnabled,
      originEnabled: applicationOrigins.isEnabled,
    })
    .from(applicationOrigins)
    .innerJoin(
      applications,
      eq(applicationOrigins.applicationId, applications.id),
    )
    .where(eq(applicationOrigins.origin, origin))
    .limit(1);

  if (rows.length === 0) {
    throw new AuthError(
      'APP_ORIGIN_NOT_FOUND',
      'Application origin is not registered',
      401,
    );
  }

  const row = rows[0];

  if (!row.originEnabled) {
    throw new AuthError(
      'APP_ORIGIN_DISABLED',
      'Application origin is disabled',
      403,
    );
  }

  if (!row.applicationEnabled) {
    throw new AuthError('APP_DISABLED', 'Application is disabled', 403);
  }

  return {
    applicationId: row.applicationId,
    applicationKey: row.applicationKey,
  };
}

/**
 * Resolve the consuming application from app_key, Origin, or Referer.
 */
export async function resolveApplicationFromRequest(
  req: Request,
): Promise<AuthContext> {
  const explicitAppKey = getExplicitAppKey(req);

  if (explicitAppKey) {
    return resolveAuthContext({
      app_key: explicitAppKey,
    });
  }

  const origin = getCallerOrigin(req);

  if (!origin) {
    throw new AuthError(
      'APP_ORIGIN_REQUIRED',
      'Application origin is required',
      400,
    );
  }

  return resolveAuthContextFromOrigin(origin);
}

