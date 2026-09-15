import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanupExpiredTokens, startCleanupJob } from '@jobs/cleanupExpiredTokens'
import { db } from '@services/dbService'
import { logger } from '@helpers/logger'

/**
 * Mock dependencies
 */
vi.mock('@services/dbService', async () => {
    const { createDbServiceMock } = await import('../helpers/dbMock');
    return createDbServiceMock();
})

vi.mock('@helpers/config', () => ({
    configGet: vi.fn((key: string) => {
        if (key === 'DEBUG') return 'true';
        return undefined;
    }),
    config: {
        DEBUG: 'true'
    }
}))

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
            const mockDelete = {
                where: vi.fn().mockResolvedValue(undefined),
            }
            ;(db.delete as any).mockReturnValue(mockDelete)

            await cleanupExpiredTokens()

            expect(db.delete).toHaveBeenCalled()
            expect(mockDelete.where).toHaveBeenCalled()
        })

        test('returns 0 on successful cleanup', async () => {
            const mockDelete = {
                where: vi.fn().mockResolvedValue(undefined),
            }
            ;(db.delete as any).mockReturnValue(mockDelete)

            const result = await cleanupExpiredTokens()

            expect(result).toBe(0)
        })

        test('handles database errors gracefully', async () => {
            ;(db.delete as any).mockImplementation(() => {
                throw new Error('Database error')
            })

            const loggerSpy = vi.spyOn(logger, 'error').mockImplementation(() => {})

            const result = await cleanupExpiredTokens()

            expect(result).toBe(0)
            expect(loggerSpy).toHaveBeenCalledWith(
                expect.stringContaining('cleanupExpiredTokens'),
                expect.any(Error)
            )

            loggerSpy.mockRestore()
        })

        test('logs successful cleanup', async () => {
            const mockDelete = {
                where: vi.fn().mockResolvedValue(undefined),
            }
            ;(db.delete as any).mockReturnValue(mockDelete)

            const consoleSpy = vi.spyOn(console, 'log').mockImplementation()

            await cleanupExpiredTokens()

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('cleanupExpiredTokens')
            )

            consoleSpy.mockRestore()
        })
    })

    describe('startCleanupJob', () => {
        test('runs cleanup immediately on startup', () => {
            const mockDelete = {
                where: vi.fn().mockResolvedValue(undefined),
            }
            ;(db.delete as any).mockReturnValue(mockDelete)

            vi.clearAllMocks()

            const intervalId = startCleanupJob()

            // db.delete should be called immediately (not just scheduled)
            expect(db.delete).toHaveBeenCalled()
            clearInterval(intervalId)
        })

        test('runs cleanup on specified interval', () => {
            const mockDelete = {
                where: vi.fn().mockResolvedValue(undefined),
            }
            ;(db.delete as any).mockReturnValue(mockDelete)

            vi.clearAllMocks()

            const intervalMs = 5000 // 5 seconds
            const intervalId = startCleanupJob(intervalMs)

            // First call is immediate, second is scheduled
            expect(db.delete).toHaveBeenCalledTimes(1)

            // Fast-forward time to trigger interval
            vi.advanceTimersByTime(intervalMs)

            // Should be called again
            expect(db.delete).toHaveBeenCalledTimes(2)

            clearInterval(intervalId)
        })

        test('handles errors during interval execution', () => {
            ;(db.delete as any).mockImplementation(() => {
                throw new Error('Database error')
            })

            const loggerSpy = vi.spyOn(logger, 'error').mockImplementation(() => {})

            const intervalId = startCleanupJob(5000)

            // Clear initial startup calls
            loggerSpy.mockClear()

            // Advance time to trigger interval
            vi.advanceTimersByTime(5000)

            // Error should be logged
            expect(loggerSpy).toHaveBeenCalled()

            clearInterval(intervalId)
            loggerSpy.mockRestore()
        })

    })
})
