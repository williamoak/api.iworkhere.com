import { describe, test, expect, vi, beforeEach, beforeAll } from 'vitest'

/**
 * All mocks are provided by vitest.setup.ts - no local mocks needed
 */

import { db } from '@services/dbService'
import { resolveAuthContext as importedResolveAuthContext, AuthError as ImportedAuthError } from '@services/auth/authContext'

/**
 * ------------------------------------------------------------
 * HELPERS
 * ------------------------------------------------------------
 */

function mockDbResult(rows: any[]) {
    ;(db.select as any).mockReturnValue({
        from: () => ({
            where: () => ({
                limit: () => Promise.resolve(rows),
            }),
        }),
    })
}

beforeEach(() => {
    // Reset only the db.select mock's call history, keep the mock itself intact
    vi.mocked(db.select).mockClear()
})

// Use the real implementation even though the module is mocked globally in vitest.setup.ts
let resolveAuthContext: typeof import('@services/auth/authContext').resolveAuthContext;
let AuthError: typeof import('@services/auth/authContext').AuthError;

beforeAll(async () => {
  const actual = await vi.importActual<typeof import('@services/auth/authContext')>('@services/auth/authContext');
  resolveAuthContext = actual.resolveAuthContext;
  AuthError = actual.AuthError;
});

/**
 * ------------------------------------------------------------
 * TESTS
 * ------------------------------------------------------------
 */

describe('resolveAuthContext', () => {
    test('throws if body is missing', async () => {
        await expect(resolveAuthContext(undefined as any))
            .rejects.toMatchObject({
                code: 'APP_KEY_REQUIRED',
                httpStatus: 400,
            })
    })

    test('throws if app_key is missing', async () => {
        await expect(resolveAuthContext({}))
            .rejects.toMatchObject({
                code: 'APP_KEY_REQUIRED',
                httpStatus: 400,
            })
    })

    test('throws if app_key is empty', async () => {
        await expect(resolveAuthContext({ app_key: '   ' }))
            .rejects.toMatchObject({
                code: 'APP_KEY_INVALID',
                httpStatus: 400,
            })
    })

    test('throws if application is not found', async () => {
        mockDbResult([])

        await expect(resolveAuthContext({ app_key: 'missing.app' }))
            .rejects.toMatchObject({
                code: 'APP_NOT_FOUND',
                httpStatus: 401,
            })
    })

    test('throws if application is disabled', async () => {
        mockDbResult([
            {
                id: 'app-id',
                appKey: 'disabled.app',
                isEnabled: false,
            },
        ])

        await expect(resolveAuthContext({ app_key: 'disabled.app' }))
            .rejects.toMatchObject({
                code: 'APP_DISABLED',
                httpStatus: 403,
            })
    })

    test('returns auth context for enabled application', async () => {
        mockDbResult([
            {
                id: 'app-id',
                appKey: 'enabled.app',
                isEnabled: true,
            },
        ])

        const ctx = await resolveAuthContext({ app_key: 'enabled.app' })

        expect(ctx).toEqual({
            applicationId: 'app-id',
            applicationKey: 'enabled.app',
        })
    })
})
