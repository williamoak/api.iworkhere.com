/**
 * @file emailAuditService.ts
 * @internal
 * @module services/auth/emailAuditService
 * @tag auth, email, audit
 * @version 1.0.0
 * @summary Audit logging for email operations.
 * @description
 *   Logs email sends (successful and failed) for auditing and debugging purposes.
 *   Helps track email delivery issues and user verification status.
 */

import { db } from '@services/dbService'
import { emailAuditLogs } from '@db/schema'
import { v7 as uuidv7 } from 'uuid'

export type EmailAuditType = 'verification' | 'password_reset'

/**
 * Log an email send event (success or failure).
 */
export async function logEmailAudit(params: {
    userId?: string
    email: string
    emailType: EmailAuditType
    status: 'sent' | 'failed'
    errorMessage?: string
}): Promise<void> {
    const { userId, email, emailType, status, errorMessage } = params

    try {
        await db.insert(emailAuditLogs).values({
            id: uuidv7(),
            userId: userId || null,
            email,
            emailType,
            status,
            errorMessage: errorMessage || null,
        })
    } catch (error) {
        // Log audit errors but don't fail the email flow
        console.error('[emailAuditService] Failed to log email audit:', error)
    }
}
