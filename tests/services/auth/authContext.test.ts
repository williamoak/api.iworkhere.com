import { describe, test, expect, vi, beforeEach } from 'vitest'

/**
 * ------------------------------------------------------------
 * MOCKS — MUST APPEAR BEFORE IMPORTS
 * ------------------------------------------------------------
 */

vi.mock('@services/dbService', () => ({
    db: {
        select: vi.fn(),
    },
}))

vi.mock('@db/schema', () => ({
    applications: {
        id: 'id',
        appKey: 'app_key',
        isEnabled: 'is_enabled',
    },
}))

/**
 * ------------------------------------------------------------
 * IMPORTS (AFTER MOCKS)
 * ------------------------------------------------------------
 */

import { db } from '@services/dbService'
import { resolveAuthContext } from '@services/auth/authContext'

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
    vi.clearAllMocks()
})

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
