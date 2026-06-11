import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanupExpiredTokens, startCleanupJob } from '@jobs/cleanupExpiredTokens'
import { db } from '@services/dbService'

/**
 * Mock dependencies
 */
vi.mock('@services/dbService', () => ({
    db: {
        delete: vi.fn(),
    },
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

            const consoleSpy = vi.spyOn(console, 'error').mockImplementation()

            const result = await cleanupExpiredTokens()

            expect(result).toBe(0)
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('cleanupExpiredTokens'),
                expect.any(Error)
            )

            consoleSpy.mockRestore()
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
        test('starts cleanup job with default interval', () => {
            const mockDelete = {
                where: vi.fn().mockResolvedValue(undefined),
            }
            ;(db.delete as any).mockReturnValue(mockDelete)

            const consoleSpy = vi.spyOn(console, 'log').mockImplementation()

            const intervalId = startCleanupJob()

            // Should be a valid timer ID
            expect(intervalId).toBeDefined()

            // Cleanup should be logged on startup
            expect(consoleSpy).toHaveBeenCalled()

            clearInterval(intervalId)
            consoleSpy.mockRestore()
        })

        test('runs cleanup immediately on startup', () => {
            const mockDelete = {
                where: vi.fn().mockResolvedValue(undefined),
            }
            ;(db.delete as any).mockReturnValue(mockDelete)

            vi.clearAllMocks()

            startCleanupJob()

            // db.delete should be called immediately (not just scheduled)
            expect(db.delete).toHaveBeenCalled()
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

        test('allows custom interval configuration', () => {
            const mockDelete = {
                where: vi.fn().mockResolvedValue(undefined),
            }
            ;(db.delete as any).mockReturnValue(mockDelete)

            const consoleSpy = vi.spyOn(console, 'log').mockImplementation()

            const customInterval = 7200000 // 2 hours
            startCleanupJob(customInterval)

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringMatching(/7200000|120 minutes/)
            )

            consoleSpy.mockRestore()
        })

        test('handles errors during interval execution', () => {
            ;(db.delete as any).mockImplementation(() => {
                throw new Error('Database error')
            })

            const consoleSpy = vi.spyOn(console, 'error').mockImplementation()

            const intervalId = startCleanupJob(5000)

            // Clear initial startup calls
            consoleSpy.mockClear()

            // Advance time to trigger interval
            vi.advanceTimersByTime(5000)

            // Error should be logged
            expect(consoleSpy).toHaveBeenCalled()

            clearInterval(intervalId)
            consoleSpy.mockRestore()
        })

        test('returns a valid interval ID for cleanup', () => {
            const mockDelete = {
                where: vi.fn().mockResolvedValue(undefined),
            }
            ;(db.delete as any).mockReturnValue(mockDelete)

            const intervalId = startCleanupJob()

            // Should be able to clear the interval
            expect(() => clearInterval(intervalId)).not.toThrow()
        })
    })
})
