/**
 * @myDocBlock v2.3
 * @file emailVerificationService.test.ts
 * @internal
 * @module tests/services/auth/emailVerificationService
 * @tag auth, email, verification, test
 * @version 1.1.0
 * @path tests/services/auth/emailVerificationService.test.ts
 * @summary Tests email verification service logic.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'

/**
 * ------------------------------------------------------------
 * MOCKS — MUST APPEAR BEFORE IMPORTS
 * ------------------------------------------------------------
 */

vi.mock('@services/dbService', () => ({
    db: {
        select: vi.fn(),
        insert: vi.fn(),
        delete: vi.fn(),
        transaction: vi.fn(),
    },
}))

vi.mock('@db/schema', () => ({
    users: {
        id: 'users.id',
        email: 'users.email',
        statusCode: 'users.status_code',
        emailVerifiedAt: 'users.email_verified_at',
    },
    userApplications: {
        userId: 'ua.user_id',
        applicationId: 'ua.application_id',
        isEnabled: 'ua.is_enabled',
    },
    emailVerificationTokens: {
        id: 'evt.id',
        userId: 'evt.user_id',
        tokenHash: 'evt.token_hash',
        expiresAt: 'evt.expires_at',
    },
}))

vi.mock('@helpers/config', () => ({
    configGet: vi.fn(() => '3600'),
}))

/**
 * ------------------------------------------------------------
 * IMPORTS (AFTER MOCKS)
 * ------------------------------------------------------------
 */

import { db } from '@services/dbService'
import {
    verifyEmailToken,
    issueEmailVerificationToken,
    resendEmailVerificationToken,
} from '@services/auth/emailVerificationService'

/**
 * ------------------------------------------------------------
 * HELPERS
 * ------------------------------------------------------------
 */

function mockSelectOnce(rows: any[]) {
    ;(db.select as any).mockReturnValueOnce({
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
    vi.resetAllMocks()
})

/**
 * ------------------------------------------------------------
 * TESTS
 * ------------------------------------------------------------
 */

describe('verifyEmailToken', () => {
    test('throws if token is missing', async () => {
        await expect(
            verifyEmailToken(undefined as any)
        ).rejects.toMatchObject({
            code: 'INVALID_TOKEN',
            httpStatus: 400,
        })
    })

    test('throws if token is invalid', async () => {
        mockSelectOnce([])

        await expect(
            verifyEmailToken('bad-token')
        ).rejects.toMatchObject({
            code: 'TOKEN_INVALID',
            httpStatus: 401,
        })
    })

    test('throws if token is expired', async () => {
        mockSelectOnce([
            {
                userId: 'user-id',
                email: 'user@example.com',
                tokenId: 'token-id',
                expiresAt: new Date(Date.now() - 1000),
            },
        ])

        await expect(
            verifyEmailToken('expired-token')
        ).rejects.toMatchObject({
            code: 'TOKEN_EXPIRED',
            httpStatus: 401,
        })
    })

    test('activates user and deletes token on success', async () => {
        mockSelectOnce([
            {
                userId: 'user-id',
                email: 'user@example.com',
                tokenId: 'token-id',
                expiresAt: new Date(Date.now() + 10000),
            },
        ])

        ;(db.transaction as any).mockImplementation(
            async (fn: any) => {
                await fn({
                    update: () => ({
                        set: () => ({
                            where: () => Promise.resolve(),
                        }),
                    }),
                    delete: () => ({
                        where: () => Promise.resolve(),
                    }),
                })
            }
        )

        const result = await verifyEmailToken('valid-token')

        expect(result).toEqual({
            id: 'user-id',
            email: 'user@example.com',
        })

        expect(db.transaction).toHaveBeenCalledOnce()
    })
})

describe('issueEmailVerificationToken', () => {
    test('inserts token and returns raw value', async () => {
        ;(db.insert as any).mockReturnValue({
            values: () => Promise.resolve(),
        })

        const result = await issueEmailVerificationToken({
            userId: 'user-id',
            email: 'user@example.com',
        })

        expect(result.token).toBeTypeOf('string')
        expect(result.token.length).toBeGreaterThan(20)
        expect(db.insert).toHaveBeenCalledOnce()
    })

    test('throws if inputs are missing', async () => {
        await expect(
            issueEmailVerificationToken({} as any)
        ).rejects.toMatchObject({
            code: 'INVALID_REQUEST',
            httpStatus: 400,
        })
    })
})

describe('resendEmailVerificationToken', () => {
    test('does nothing if user not found', async () => {
        mockSelectOnce([])

        await resendEmailVerificationToken({
            applicationId: 'app-id',
            email: 'missing@example.com',
        })

        expect(db.transaction).not.toHaveBeenCalled()
    })

    test('does nothing if user is not pending', async () => {
        mockSelectOnce([
            {
                userId: 'user-id',
                status: 'active',
            },
        ])

        await resendEmailVerificationToken({
            applicationId: 'app-id',
            email: 'user@example.com',
        })

        expect(db.transaction).not.toHaveBeenCalled()
    })

    test('invalidates old tokens and issues new one for pending user', async () => {
        mockSelectOnce([
            {
                userId: 'user-id',
                status: 'pending',
            },
        ])

        ;(db.transaction as any).mockImplementation(
            async (fn: any) => {
                await fn({
                    delete: () => ({
                        where: () => Promise.resolve(),
                    }),
                    insert: () => ({
                        values: () => Promise.resolve(),
                    }),
                })
            }
        )

        await resendEmailVerificationToken({
            applicationId: 'app-id',
            email: 'user@example.com',
        })

        expect(db.transaction).toHaveBeenCalledOnce()
    })
})
