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
    users: {
        id: 'id',
        username: 'username',
        email: 'email',
        statusCode: 'status_code',
    },
    userApplications: {
        userId: 'user_id',
        applicationId: 'application_id',
        role: 'role',
        isEnabled: 'is_enabled',
    },
}))

/**
 * ------------------------------------------------------------
 * IMPORTS (AFTER MOCKS)
 * ------------------------------------------------------------
 */

import { db } from '@services/dbService'
import { resolveUserForApplication } from '@services/auth/authUserResolver'

/**
 * ------------------------------------------------------------
 * HELPERS
 * ------------------------------------------------------------
 */

function mockDbResult(rows: any[]) {
    ;(db.select as any).mockReturnValue({
        from: () => ({
            innerJoin: () => ({
                where: () => ({
                    limit: () => Promise.resolve(rows),
                }),
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

describe('resolveUserForApplication', () => {
    const applicationId = 'app-id'

    test('throws if identifier is missing', async () => {
        await expect(
            resolveUserForApplication(undefined as any, applicationId)
        ).rejects.toMatchObject({
            code: 'INVALID_CREDENTIALS',
            httpStatus: 401,
        })
    })

    test('throws if user is not found', async () => {
        mockDbResult([])

        await expect(
            resolveUserForApplication('missing', applicationId)
        ).rejects.toMatchObject({
            code: 'INVALID_CREDENTIALS',
            httpStatus: 401,
        })
    })

    test('throws if user is disabled', async () => {
        mockDbResult([
            {
                userId: 'user-id',
                username: 'bill',
                email: 'bill@example.com',
                status: 'disabled',
                role: 'user',
                appEnabled: true,
            },
        ])

        await expect(
            resolveUserForApplication('bill', applicationId)
        ).rejects.toMatchObject({
            code: 'USER_DISABLED',
            httpStatus: 403,
        })
    })

    test('throws if application access is disabled', async () => {
        mockDbResult([
            {
                userId: 'user-id',
                username: 'bill',
                email: 'bill@example.com',
                status: 'active',
                role: 'user',
                appEnabled: false,
            },
        ])

        await expect(
            resolveUserForApplication('bill', applicationId)
        ).rejects.toMatchObject({
            code: 'INVALID_CREDENTIALS',
            httpStatus: 401,
        })
    })

    test('resolves user by username', async () => {
        mockDbResult([
            {
                userId: 'user-id',
                username: 'bill',
                email: 'bill@example.com',
                status: 'active',
                role: 'owner',
                appEnabled: true,
            },
        ])

        const result = await resolveUserForApplication(
            'bill',
            applicationId
        )

        expect(result).toEqual({
            userId: 'user-id',
            username: 'bill',
            email: 'bill@example.com',
            role: 'owner',
        })
    })

    test('resolves user by email', async () => {
        mockDbResult([
            {
                userId: 'user-id',
                username: 'bill',
                email: 'bill@example.com',
                status: 'active',
                role: 'owner',
                appEnabled: true,
            },
        ])

        const result = await resolveUserForApplication(
            'bill@example.com',
            applicationId
        )

        expect(result).toEqual({
            userId: 'user-id',
            username: 'bill',
            email: 'bill@example.com',
            role: 'owner',
        })
    })
})
