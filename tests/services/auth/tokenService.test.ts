import { describe, test, expect, vi, beforeEach } from 'vitest'

/**
 * ------------------------------------------------------------
 * MOCKS — MUST APPEAR BEFORE IMPORTS
 * ------------------------------------------------------------
 */

vi.mock('crypto', () => ({
    default: {
        randomBytes: vi.fn(() => ({
            toString: () => 'raw-token',
        })),
        createHash: vi.fn(() => ({
            update: () => ({
                digest: () => 'hashed-token',
            }),
        })),
    },
}))

vi.mock('@helpers/config', () => ({
    configGetNumber: vi.fn((key: string) => {
        if (key === 'ACCESS_TOKEN_TTL_SECONDS') return 900
        if (key === 'REFRESH_TOKEN_TTL_SECONDS') return 3600
        throw new Error('Unexpected key')
    }),
}))

vi.mock('@services/dbService', () => ({
    db: {
        insert: vi.fn(),
        select: vi.fn(),
        update: vi.fn(),
        transaction: vi.fn(),
    },
}))

vi.mock('@db/schema', () => ({
    authTokens: {
        id: 'id',
        userId: 'user_id',
        applicationId: 'application_id',
        tokenType: 'token_type',
        tokenHash: 'token_hash',
        expiresAt: 'expires_at',
        revokedAt: 'revoked_at',
        replacedByTokenId: 'replaced_by_token_id',
    },
}))

/**
 * ------------------------------------------------------------
 * IMPORTS (AFTER MOCKS)
 * ------------------------------------------------------------
 */

import { db } from '@services/dbService'
import {
    issueLoginTokens,
    refreshTokens,
    revokeToken,
} from '@services/auth/tokenService'

/**
 * ------------------------------------------------------------
 * HELPERS
 * ------------------------------------------------------------
 */

beforeEach(() => {
    vi.resetAllMocks()
})

/**
 * ------------------------------------------------------------
 * TESTS
 * ------------------------------------------------------------
 */

describe('tokenService', () => {
    const userId = 'user-id'
    const applicationId = 'app-id'

    describe('issueLoginTokens', () => {
        test('issues access and refresh tokens', async () => {
            ;(db.insert as any).mockReturnValue({
                values: () => Promise.resolve(),
            })

            const result = await issueLoginTokens(userId, applicationId)

            expect(result.access.token).toBe('raw-token')
            expect(result.refresh.token).toBe('raw-token')

            expect(db.insert).toHaveBeenCalledOnce()
        })
    })

    describe('refreshTokens', () => {
        test('throws if refresh token is invalid', async () => {
            await expect(
                refreshTokens(undefined as any)
            ).rejects.toMatchObject({
                code: 'INVALID_TOKEN',
                httpStatus: 401,
            })
        })

        test('throws if refresh token is not found', async () => {
            ;(db.select as any).mockReturnValueOnce({
                from: () => ({
                    where: () => ({
                        limit: () => Promise.resolve([]),
                    }),
                }),
            })

            await expect(
                refreshTokens('missing-token')
            ).rejects.toMatchObject({
                code: 'INVALID_TOKEN',
                httpStatus: 401,
            })
        })

        test('rotates refresh token and issues new tokens', async () => {
            ;(db.select as any).mockReturnValueOnce({
                from: () => ({
                    where: () => ({
                        limit: () =>
                            Promise.resolve([
                                {
                                    id: 'old-token-id',
                                    userId,
                                    applicationId,
                                },
                            ]),
                    }),
                }),
            })

            ;(db.transaction as any).mockImplementation(
                async (fn: any) => {
                    await fn({
                        update: () => ({
                            set: () => ({
                                where: () => Promise.resolve(),
                            }),
                        }),
                        insert: () => ({
                            values: () => ({
                                returning: () => Promise.resolve([{ id: 'new-refresh-id' }]),
                            }),
                        }),
                    })
                }
            )

            const result = await refreshTokens('old-refresh')

            expect(result.access.token).toBe('raw-token')
            expect(result.refresh.token).toBe('raw-token')
        })
    })

    describe('revokeToken', () => {
        test('ignores invalid input', async () => {
            await expect(
                revokeToken(undefined as any)
            ).resolves.toBeUndefined()
        })

        test('revokes matching token', async () => {
            ;(db.update as any).mockReturnValue({
                set: () => ({
                    where: () => Promise.resolve(),
                }),
            })

            await expect(
                revokeToken('some-token')
            ).resolves.toBeUndefined()

            expect(db.update).toHaveBeenCalledOnce()
        })
    })
})
