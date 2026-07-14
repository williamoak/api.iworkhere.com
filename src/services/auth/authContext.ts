/**
 * @myDocBlock
 * @file authContext.ts
 * @internal
 * @module services/auth
 * @tag auth, application, context
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path src/services/auth/authContext.ts
 * @summary Resolves and enforces application-scoped authentication context.
 * @description
 * Provides the mandatory first step for all authentication-related endpoints.
 * This module validates the presence of an application key, resolves the
 * corresponding application record, and enforces application enablement.
 *
 * This logic is intentionally isolated from user, credential, and token
 * concerns to guarantee that all auth operations are strictly
 * application-scoped.
 *
 * This module throws typed domain errors and does not perform any HTTP
 * response handling.
 *
 * @requestExample
 * {
 *   "app_key": "bill.iworkhere.com"
 * }
 *
 * @response
 * {
 *   "applicationId": "uuid",
 *   "applicationKey": "bill.iworkhere.com"
 * }
 *
 * @requires
 * {
 *   "tables": [
 *     "applications"
 *   ],
 *   "services": [
 *     "@services/dbService"
 *   ]
 * }
 *
 * @internal
 */

import { db } from '@services/dbService'
import { applications } from '@db/schema'
import { eq } from 'drizzle-orm'
import type { Request } from 'express'

export class AuthError extends Error {
    public readonly code: string
    public readonly httpStatus: number

    constructor(code: string, message: string, httpStatus: number) {
        super(message)
        this.code = code
        this.httpStatus = httpStatus
    }
}

export type AuthContext = {
    applicationId: string
    applicationKey: string
}

export async function resolveAuthContext(
    body: unknown,
    req?: Request
): Promise<AuthContext> {
    let appKey = (typeof body === 'object' && body !== null && 'app_key' in body)
        ? (body as any).app_key
        : undefined;

    if (!appKey && req) {
        appKey = req.get('host');
    }

    if (!appKey || typeof appKey !== 'string') {
        throw new AuthError(
            'APP_KEY_REQUIRED',
            'Application key is required',
            400
        )
    }

    appKey = appKey.trim();

    if (!appKey) {
        throw new AuthError(
            'APP_KEY_INVALID',
            'Application key is invalid',
            400
        )
    }

    const rows = await db
        .select({
            id: applications.id,
            appKey: applications.appKey,
            isEnabled: applications.isEnabled,
        })
        .from(applications)
        .where(eq(applications.appKey, appKey))
        .limit(1)

    if (rows.length === 0) {
        throw new AuthError(
            'APP_NOT_FOUND',
            'Application not found',
            401
        )
    }

    const app = rows[0]

    if (!app.isEnabled) {
        throw new AuthError(
            'APP_DISABLED',
            'Application is disabled',
            403
        )
    }

    return {
        applicationId: app.id,
        applicationKey: app.appKey,
    }
}
