import { describe, test, expect, vi, beforeEach } from 'vitest'

/**
 * Mock dependencies
 */
vi.mock('@helpers/config', () => ({
    configGet: vi.fn((key: string) => {
        const config: Record<string, string> = {
            SMTP_HOST: 'smtp.test.com',
            SMTP_PORT: '587',
            SMTP_USER: 'test@smtp.com',
            SMTP_PASS: 'password',
            SMTP_FROM_EMAIL: 'noreply@test.com',
        }
        return config[key] || ''
    }),
}))

vi.mock('@services/auth/emailAuditService', () => ({
    logEmailAudit: vi.fn(),
}))

vi.mock('nodemailer', () => ({
    default: {
        createTransport: vi.fn(() => ({
            sendMail: vi.fn(),
        })),
        getTestMessageUrl: vi.fn(() => 'http://ethereal.email/message/123'),
    },
}))

import { sendEmail } from '@helpers/mailer'
import { logEmailAudit } from '@services/auth/emailAuditService'
import nodemailer from 'nodemailer'

/**
 * Test suite
 */
describe('mailer', () => {
    let mockSendMail: any

    beforeEach(() => {
        vi.clearAllMocks()

        // Get reference to the mocked sendMail
        const transport = nodemailer.createTransport({} as any)
        mockSendMail = transport.sendMail
    })

    describe('sendEmail', () => {
        test('sends email successfully', async () => {
            mockSendMail.mockResolvedValue({
                messageId: 'msg-123',
            })

            await sendEmail({
                to: 'user@example.com',
                subject: 'Test Subject',
                text: 'Test body',
                html: '<p>Test body</p>',
            })

            expect(mockSendMail).toHaveBeenCalledWith(
                expect.objectContaining({
                    from: 'noreply@test.com',
                    to: 'user@example.com',
                    subject: 'Test Subject',
                    text: 'Test body',
                    html: '<p>Test body</p>',
                })
            )
        })

        test('logs successful send with audit info', async () => {
            mockSendMail.mockResolvedValue({
                messageId: 'msg-123',
            })

            await sendEmail({
                to: 'user@example.com',
                subject: 'Test',
                text: 'Test',
                auditUserId: 'user-123',
                auditType: 'verification',
            })

            expect(logEmailAudit).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: 'user-123',
                    email: 'user@example.com',
                    emailType: 'verification',
                    status: 'sent',
                })
            )
        })

        test('logs failed send when throwOnError is false', async () => {
            mockSendMail.mockRejectedValue(new Error('SMTP failed'))

            await sendEmail({
                to: 'user@example.com',
                subject: 'Test',
                text: 'Test',
                throwOnError: false,
                auditUserId: 'user-123',
                auditType: 'verification',
            })

            expect(logEmailAudit).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: 'failed',
                    errorMessage: 'SMTP failed',
                })
            )
        })

        test('throws error when throwOnError is true', async () => {
            mockSendMail.mockRejectedValue(new Error('SMTP failed'))

            await expect(
                sendEmail({
                    to: 'user@example.com',
                    subject: 'Test',
                    text: 'Test',
                    throwOnError: true,
                })
            ).rejects.toThrow('SMTP failed')
        })

        test('does not throw error when throwOnError is false', async () => {
            mockSendMail.mockRejectedValue(new Error('SMTP failed'))

            await expect(
                sendEmail({
                    to: 'user@example.com',
                    subject: 'Test',
                    text: 'Test',
                    throwOnError: false,
                })
            ).resolves.not.toThrow()
        })

        test('logs ethereal preview URL in development', async () => {
            mockSendMail.mockResolvedValue({
                messageId: 'msg-123',
            })

            const consoleSpy = vi.spyOn(console, 'log').mockImplementation()

            await sendEmail({
                to: 'user@example.com',
                subject: 'Test',
                text: 'Test',
                auditType: 'verification',
            })

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Email sent to user@example.com')
            )

            consoleSpy.mockRestore()
        })

        test('includes auditType in mailer call', async () => {
            mockSendMail.mockResolvedValue({
                messageId: 'msg-123',
            })

            await sendEmail({
                to: 'user@example.com',
                subject: 'Test',
                text: 'Test',
                auditType: 'password_reset',
                auditUserId: 'user-456',
            })

            expect(logEmailAudit).toHaveBeenCalledWith(
                expect.objectContaining({
                    emailType: 'password_reset',
                })
            )
        })
    })
})
