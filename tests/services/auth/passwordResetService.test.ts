/**
 * @myDocBlock v2.3
 * @file passwordResetService.test.ts
 * @internal
 * @module tests/services/auth/passwordResetService
 * @tag auth, password, reset, test
 * @version 1.0.0
 * @path tests/services/auth/passwordResetService.test.ts
 * @summary Tests password reset domain logic.
 * @description
 * Covers initiate, verify, and complete password reset flows,
 * including security enforcement and token lifecycle behavior.
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
        update: vi.fn(),
        delete: vi.fn(),
        transaction: vi.fn(),
    },
}))

vi.mock('@helpers/config', () => ({
    configGet: vi.fn(() => '3600'),
}))

vi.mock('@services/auth/passwordService', () => ({
    hashPassword: vi.fn(async () => 'hashed-password'),
    enforcePasswordHistory: vi.fn(async () => undefined),
}))

vi.mock('@db/schema', () => ({
    users: {
        id: 'id',
        username: 'username',
        email: 'email',
        statusCode: 'status_code',
    },
    passwordResetTokens: {
        id: 'id',
        userId: 'user_id',
        tokenHash: 'token_hash',
        expiresAt: 'expires_at',
    },
    userAuthLocal: {
        userId: 'user_id',
        passwordHash: 'password_hash',
        isEnabled: 'is_enabled',
    },
    userPasswordHistory: {
        userId: 'user_id',
        passwordHash: 'password_hash',
    },
    authTokens: {
        userId: 'user_id',
        revokedAt: 'revoked_at',
    },
}))

/**
 * ------------------------------------------------------------
 * IMPORTS (AFTER MOCKS)
 * ------------------------------------------------------------
 */

import { db } from '@services/dbService'
import {
    initiatePasswordReset,
    verifyPasswordResetToken,
    completePasswordReset,
} from '@services/auth/passwordResetService'
import { AuthError } from '@services/auth/authContext'
import { enforcePasswordHistory } from '@services/auth/passwordService'

/**
 * ------------------------------------------------------------
 * HELPERS
 * ------------------------------------------------------------
 */

function mockSelectOnce(rows: any[]) {
    ;(db.select as any).mockReturnValueOnce({
        from: () => ({
            where: () => ({
                limit: () => Promise.resolve(rows),
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

describe('passwordResetService', () => {
    /**
     * ------------------------------------------------------------
     * initiatePasswordReset
     * ------------------------------------------------------------
     */

    test('initiate: returns noop token when user not found', async () => {
        mockSelectOnce([])

        const result = await initiatePasswordReset('missing')

        expect(result.token).toBe('noop')
    })

    test('initiate: throws if user is not active', async () => {
        mockSelectOnce([{ userId: 'u1', status: 'pending' }])

        await expect(
            initiatePasswordReset('bill')
        ).rejects.toBeInstanceOf(AuthError)
    })

    test('initiate: inserts reset token for active user', async () => {
        mockSelectOnce([{ userId: 'u1', status: 'active' }])

        ;(db.insert as any).mockReturnValue({
            values: () => Promise.resolve(),
        })

        const result = await initiatePasswordReset('bill')

        expect(result.token).toBeTypeOf('string')
        expect(db.insert).toHaveBeenCalled()
    })

    /**
     * ------------------------------------------------------------
     * verifyPasswordResetToken
     * ------------------------------------------------------------
     */

    test('verify: throws if token is invalid', async () => {
        mockSelectOnce([])

        await expect(
            verifyPasswordResetToken('bad-token')
        ).rejects.toBeInstanceOf(AuthError)
    })

    test('verify: throws if token is expired', async () => {
        mockSelectOnce([
            {
                tokenId: 't1',
                userId: 'u1',
                expiresAt: new Date(Date.now() - 1000),
            },
        ])

        await expect(
            verifyPasswordResetToken('expired-token')
        ).rejects.toBeInstanceOf(AuthError)
    })

    test('verify: returns userId for valid token', async () => {
        mockSelectOnce([
            {
                tokenId: 't1',
                userId: 'u1',
                expiresAt: new Date(Date.now() + 100000),
            },
        ])

        const result = await verifyPasswordResetToken('valid-token')

        expect(result).toEqual({ userId: 'u1' })
    })

    /**
     * ------------------------------------------------------------
     * completePasswordReset
     * ------------------------------------------------------------
     */

    test('complete: throws if token is invalid', async () => {
        mockSelectOnce([])

        await expect(
            completePasswordReset('bad-token', 'newpass')
        ).rejects.toBeInstanceOf(AuthError)
    })

    test('complete: resets password, revokes tokens, deletes reset token', async () => {
        mockSelectOnce([
            {
                tokenId: 't1',
                userId: 'u1',
                expiresAt: new Date(Date.now() + 100000),
            },
        ])

        ;(db.transaction as any).mockImplementation(async (fn: any) => {
            await fn({
                update: () => ({
                    set: () => ({
                        where: () => Promise.resolve(),
                    }),
                }),
                insert: () => ({
                    values: () => Promise.resolve(),
                }),
                delete: () => ({
                    where: () => Promise.resolve(),
                }),
            })
        })

        await expect(
            completePasswordReset('valid-token', 'newpass')
        ).resolves.toBeUndefined()

        expect(enforcePasswordHistory).toHaveBeenCalledWith(
            'u1',
            'newpass',
            'hashed-password'
        )
        expect(db.transaction).toHaveBeenCalled()
    })
})
