import { describe, test, expect, vi, beforeEach } from 'vitest'
import { logEmailAudit } from '@services/auth/emailAuditService'
import { db } from '@services/dbService'

/**
 * Mock dependencies
 */
vi.mock('@services/dbService', () => ({
    db: {
        insert: vi.fn(),
    },
}))

/**
 * Test suite
 */
describe('emailAuditService', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe('logEmailAudit', () => {
        test('logs successful email send with all parameters', async () => {
            const mockInsert = {
                values: vi.fn().mockResolvedValue(undefined),
            }
            ;(db.insert as any).mockReturnValue(mockInsert)

            await logEmailAudit({
                userId: 'user-123',
                email: 'test@example.com',
                emailType: 'verification',
                status: 'sent',
            })

            expect(db.insert).toHaveBeenCalled()
            expect(mockInsert.values).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: 'user-123',
                    email: 'test@example.com',
                    emailType: 'verification',
                    status: 'sent',
                    errorMessage: null,
                })
            )
        })

        test('logs failed email send with error message', async () => {
            const mockInsert = {
                values: vi.fn().mockResolvedValue(undefined),
            }
            ;(db.insert as any).mockReturnValue(mockInsert)

            await logEmailAudit({
                userId: 'user-123',
                email: 'test@example.com',
                emailType: 'verification',
                status: 'failed',
                errorMessage: 'SMTP connection timeout',
            })

            expect(mockInsert.values).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: 'failed',
                    errorMessage: 'SMTP connection timeout',
                })
            )
        })

        test('logs email without userId (guest context)', async () => {
            const mockInsert = {
                values: vi.fn().mockResolvedValue(undefined),
            }
            ;(db.insert as any).mockReturnValue(mockInsert)

            await logEmailAudit({
                email: 'test@example.com',
                emailType: 'password_reset',
                status: 'sent',
            })

            expect(mockInsert.values).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: null,
                    email: 'test@example.com',
                })
            )
        })

        test('handles database errors gracefully without throwing', async () => {
            ;(db.insert as any).mockImplementation(() => {
                throw new Error('Database connection failed')
            })

            // Should not throw - errors logged
            await expect(
                logEmailAudit({
                    userId: 'user-123',
                    email: 'test@example.com',
                    emailType: 'verification',
                    status: 'sent',
                })
            ).resolves.not.toThrow()
        })

        test('supports password_reset email type', async () => {
            const mockInsert = {
                values: vi.fn().mockResolvedValue(undefined),
            }
            ;(db.insert as any).mockReturnValue(mockInsert)

            await logEmailAudit({
                userId: 'user-123',
                email: 'test@example.com',
                emailType: 'password_reset',
                status: 'sent',
            })

            expect(mockInsert.values).toHaveBeenCalledWith(
                expect.objectContaining({
                    emailType: 'password_reset',
                })
            )
        })
    })
})
