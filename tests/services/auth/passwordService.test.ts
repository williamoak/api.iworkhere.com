import { describe, test, expect, vi, beforeEach } from 'vitest'

/**
 * ------------------------------------------------------------
 * MOCKS — MUST APPEAR BEFORE IMPORTS
 * ------------------------------------------------------------
 */

vi.mock('bcryptjs', () => ({
    default: {
        compare: vi.fn(),
        hash: vi.fn(),
    },
}))

vi.mock('@services/dbService', () => ({
    db: {
        select: vi.fn(),
        insert: vi.fn(),
    },
}))

vi.mock('@db/schema', () => ({
    userAuthLocal: {
        userId: 'user_id',
        passwordHash: 'password_hash',
        isEnabled: 'is_enabled',
    },
    userPasswordHistory: {
        userId: 'user_id',
        passwordHash: 'password_hash',
    },
}))

/**
 * ------------------------------------------------------------
 * IMPORTS (AFTER MOCKS)
 * ------------------------------------------------------------
 */

import bcrypt from 'bcryptjs'
import { db } from '@services/dbService'
import {
    verifyPassword,
    hashPassword,
    enforcePasswordHistory,
} from '@services/auth/passwordService'

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

describe('passwordService', () => {
    const userId = 'user-id'

    describe('verifyPassword', () => {
        test('throws if plaintext password is missing', async () => {
            await expect(
                verifyPassword(userId, undefined as any)
            ).rejects.toMatchObject({
                code: 'INVALID_CREDENTIALS',
                httpStatus: 401,
            })
        })

        test('throws if auth record is missing', async () => {
            mockSelectOnce([])

            await expect(
                verifyPassword(userId, 'password')
            ).rejects.toMatchObject({
                code: 'INVALID_CREDENTIALS',
                httpStatus: 401,
            })
        })

        test('throws if auth record is disabled', async () => {
            mockSelectOnce([
                { passwordHash: 'hash', isEnabled: false },
            ])

            await expect(
                verifyPassword(userId, 'password')
            ).rejects.toMatchObject({
                code: 'INVALID_CREDENTIALS',
                httpStatus: 401,
            })
        })

        test('throws if password does not match', async () => {
            mockSelectOnce([
                { passwordHash: 'hash', isEnabled: true },
            ])

            ;(bcrypt.compare as any).mockResolvedValue(false)

            await expect(
                verifyPassword(userId, 'wrong')
            ).rejects.toMatchObject({
                code: 'INVALID_CREDENTIALS',
                httpStatus: 401,
            })
        })

        test('resolves if password matches', async () => {
            mockSelectOnce([
                { passwordHash: 'hash', isEnabled: true },
            ])

            ;(bcrypt.compare as any).mockResolvedValue(true)

            await expect(
                verifyPassword(userId, 'correct')
            ).resolves.toBeUndefined()
        })
    })

    describe('hashPassword', () => {
        test('throws if password is invalid', async () => {
            await expect(
                hashPassword('')
            ).rejects.toMatchObject({
                code: 'PASSWORD_INVALID',
                httpStatus: 400,
            })
        })

        test('returns bcrypt hash', async () => {
            ;(bcrypt.hash as any).mockResolvedValue('hashed')

            const result = await hashPassword('password')

            expect(result).toBe('hashed')
        })
    })

    describe('enforcePasswordHistory', () => {
        test('throws if password was used previously', async () => {
            ;(db.select as any).mockReturnValueOnce({
                from: () => ({
                    where: () => Promise.resolve([
                        { passwordHash: 'old-hash' },
                    ]),
                }),
            })

            ;(bcrypt.compare as any).mockResolvedValue(true)

            await expect(
                enforcePasswordHistory(userId, 'new-password', 'new-hash')
            ).rejects.toMatchObject({
                code: 'PASSWORD_REUSE',
                httpStatus: 400,
            })

            expect(bcrypt.compare).toHaveBeenCalledWith(
                'new-password',
                'old-hash'
            )
        })

        test('inserts password history for new password', async () => {
            ;(db.select as any).mockReturnValueOnce({
                from: () => ({
                    where: () => Promise.resolve([]),
                }),
            })

            ;(db.insert as any).mockReturnValue({
                values: () => Promise.resolve(),
            })

            await expect(
                enforcePasswordHistory(userId, 'new-password', 'new-hash')
            ).resolves.toBeUndefined()
        })
    })
})
