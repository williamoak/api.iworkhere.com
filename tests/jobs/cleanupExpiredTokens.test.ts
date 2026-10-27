import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  cleanupExpiredCeremonies,
  cleanupExpiredTokens,
  startCleanupJob,
} from '@jobs/cleanupExpiredTokens'
import { db } from '@services/dbService'
import { logger } from '@helpers/logger'

/**
 * Mock dependencies
 */
vi.mock('@services/dbService', async () => {
    const { createDbServiceMock } = await import('../helpers/dbMock');
    return createDbServiceMock();
})

vi.mock('@db/schema', () => ({
    emailVerificationTokens: { id: 'id-column', expiresAt: 'expires-at-column' },
    consumedWebauthnCeremonies: { jti: 'jti-column', expiresAt: 'expires-at-column' },
}))

vi.mock('@helpers/config', () => ({
    configGet: vi.fn((key: string) => {
        if (key === 'DEBUG') return 'true';
        return undefined;
    }),
    config: {
        DEBUG: 'true'
    }
}))

/** Builds the delete(...).where(...).returning(...) chain, resolving to the given rows. */
function mockDeleteRows(rows: Array<{ id?: string; jti?: string }>) {
    const returning = vi.fn().mockResolvedValue(rows)
    const where = vi.fn(() => ({ returning }))
    ;(db.delete as any).mockReturnValue({ where })
    return { where, returning }
}

/**
 * Test suite
 */
describe('cleanupExpiredTokens', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    describe('cleanupExpiredTokens', () => {
        test('deletes expired tokens from database', async () => {
            const { where, returning } = mockDeleteRows([])

            await cleanupExpiredTokens()

            expect(db.delete).toHaveBeenCalled()
            expect(where).toHaveBeenCalled()
            expect(returning).toHaveBeenCalled()
        })

        test('returns the number of deleted tokens', async () => {
            mockDeleteRows([{ id: 'a' }, { id: 'b' }])

            const result = await cleanupExpiredTokens()

            expect(result).toBe(2)
        })

        test('rethrows database errors after logging them', async () => {
            ;(db.delete as any).mockImplementation(() => {
                throw new Error('Database error')
            })

            const loggerSpy = vi.spyOn(logger, 'error').mockImplementation(() => {})

            await expect(cleanupExpiredTokens()).rejects.toThrow('Database error')
            expect(loggerSpy).toHaveBeenCalledWith(
                expect.stringContaining('cleanupExpiredTokens'),
                expect.any(Error)
            )

            loggerSpy.mockRestore()
        })

        test('logs successful cleanup', async () => {
            mockDeleteRows([{ id: 'a' }])

            const logSpy = vi.spyOn(logger, 'log').mockImplementation(() => {})

            await cleanupExpiredTokens()

            expect(logSpy).toHaveBeenCalledWith(
                expect.stringContaining('cleanupExpiredTokens')
            )

            logSpy.mockRestore()
        })
    })

    describe('cleanupExpiredCeremonies', () => {
        test('deletes consumed ceremonies whose expiry is older than the grace period', async () => {
            vi.setSystemTime(new Date('2026-10-22T12:00:00Z'))
            const { where } = mockDeleteRows([{ jti: 'a' }])

            const result = await cleanupExpiredCeremonies()

            expect(result).toBe(1)
            expect(db.delete).toHaveBeenCalledTimes(1)
            expect(where).toHaveBeenCalledTimes(1)
        })

        test('returns 0 when no records are expired', async () => {
            mockDeleteRows([])

            await expect(cleanupExpiredCeremonies()).resolves.toBe(0)
        })

        test('rethrows database errors after logging them', async () => {
            ;(db.delete as any).mockImplementation(() => {
                throw new Error('Database error')
            })

            const loggerSpy = vi.spyOn(logger, 'error').mockImplementation(() => {})

            await expect(cleanupExpiredCeremonies()).rejects.toThrow('Database error')
            expect(loggerSpy).toHaveBeenCalledWith(
                expect.stringContaining('cleanupExpiredCeremonies'),
                expect.any(Error)
            )

            loggerSpy.mockRestore()
        })
    })

    describe('startCleanupJob', () => {
        test('runs both cleanups immediately on startup', () => {
            mockDeleteRows([])

            const intervalId = startCleanupJob()

            // Both tables use db.delete, so both cleanups run synchronously up to the first await.
            expect(db.delete).toHaveBeenCalledTimes(2)
            clearInterval(intervalId)
        })

        test('runs both cleanups again on each interval', async () => {
            mockDeleteRows([])

            const intervalMs = 5000
            const intervalId = startCleanupJob(intervalMs)

            // Startup run: one email-token cleanup and one ceremony cleanup.
            expect(db.delete).toHaveBeenCalledTimes(2)

            await vi.advanceTimersByTimeAsync(intervalMs)

            expect(db.delete).toHaveBeenCalledTimes(4)

            clearInterval(intervalId)
        })

        test('rejects an interval below one second', () => {
            expect(() => startCleanupJob(999)).toThrow(RangeError)
        })

        test('keeps the scheduler running after a failed interval', async () => {
            ;(db.delete as any).mockImplementation(() => {
                throw new Error('Database error')
            })

            const loggerSpy = vi.spyOn(logger, 'error').mockImplementation(() => {})

            const intervalId = startCleanupJob(5000)
            await vi.advanceTimersByTimeAsync(0)
            loggerSpy.mockClear()

            await vi.advanceTimersByTimeAsync(5000)

            // Both cleanups log their own failure on each run.
            expect(loggerSpy).toHaveBeenCalledWith(
                expect.stringContaining('cleanupExpiredTokens'),
                expect.any(Error)
            )
            expect(loggerSpy).toHaveBeenCalledWith(
                expect.stringContaining('cleanupExpiredCeremonies'),
                expect.any(Error)
            )

            clearInterval(intervalId)
            loggerSpy.mockRestore()
        })

        test('skips an overlapping run while the previous one is still active', async () => {
            let release!: () => void
            const pending = new Promise<unknown[]>((resolve) => {
                release = () => resolve([])
            })
            const returning = vi.fn(() => pending)
            ;(db.delete as any).mockReturnValue({ where: vi.fn(() => ({ returning })) })

            const logSpy = vi.spyOn(logger, 'log').mockImplementation(() => {})

            const intervalId = startCleanupJob(5000)
            await vi.advanceTimersByTimeAsync(5000)

            expect(logSpy).toHaveBeenCalledWith(
                expect.stringContaining('Previous cleanup still running')
            )

            release()
            await vi.advanceTimersByTimeAsync(0)
            clearInterval(intervalId)
            logSpy.mockRestore()
        })
    })
})
