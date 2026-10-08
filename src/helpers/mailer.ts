import { logger } from '@helpers/logger';

/**
 * @file mailer.ts
 * @module helpers/mailer
 * @summary Centralized email sending utility using Nodemailer.
 * @description
 *   Sends emails via SMTP. Email failures are logged but don't throw by default,
 *   allowing registration/resend flows to continue even if the mailer is unavailable.
 *   Callers can optionally enforce failures via the throwOnError flag.
 *   All sends are logged to the email_audit_logs table for auditing.
 */

import nodemailer, { type Transporter } from 'nodemailer';
import { configGet } from '@helpers/config';
import { logEmailAudit } from '@services/auth/emailAuditService';

// Create a reusable transporter using SMTP settings from the environment
let transporter: Transporter | null = null;


export function resetTransporter() {
    transporter = null;
}

function getTransporter() {
    if (!transporter) {
        transporter = nodemailer.createTransport({
            host: configGet('SMTP_HOST'),
            port: Number(configGet('SMTP_PORT')),
            secure: Number(configGet('SMTP_PORT')) === 465, // true for 465, false for other ports
            auth: {
                user: configGet('SMTP_USER'),
                pass: configGet('SMTP_PASS'),
            },
        });
    }
    return transporter;
}

function getSmtpDiagnostics() {
    const host = configGet('SMTP_HOST');
    const port = Number(configGet('SMTP_PORT'));

    return {
        host: host || '(missing)',
        port: Number.isFinite(port) ? port : '(invalid)',
        secure: port === 465,
        credentialsConfigured: Boolean(configGet('SMTP_USER') && configGet('SMTP_PASS')),
    };
}

export async function sendEmail(params: {
    to: string;
    subject: string;
    text: string;
    html?: string;
    throwOnError?: boolean;
    auditUserId?: string;
    auditType?: 'verification' | 'password_reset';
}): Promise<void> {
    const {
        to,
        subject,
        text,
        html,
        throwOnError = false,
        auditUserId,
        auditType,
    } = params;
    try {
        const from = configGet('SMTP_FROM_EMAIL');
        const mailOptions = {
            from,
            to,
            subject,
            text,
            html,
            headers: {
                'X-Mailin-Tracking-Disable': '1'
            }
        };
        const smtp = getSmtpDiagnostics();
        const mailer = getTransporter();

        logger.log(
            `[mailer] SMTP send requested (to: ${to}, host: ${smtp.host}, port: ${smtp.port}, secure: ${smtp.secure}, credentialsConfigured: ${smtp.credentialsConfigured})`,
            true,
        );

        const info = await mailer.sendMail(mailOptions);
        logger.log(
            `[mailer] SMTP accepted message (to: ${to}, messageId: ${info.messageId}, accepted: ${info.accepted?.length ?? 0}, rejected: ${info.rejected?.length ?? 0}, response: ${info.response ?? 'unavailable'})`,
            true,
        );

        // If using Ethereal email for testing, this prints a URL to view the email
        if (configGet('SMTP_HOST').includes('ethereal')) {
            logger.log(`[mailer] Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
        }

        // Log successful send
        if (auditType) {
            await logEmailAudit({
                userId: auditUserId,
                email: to,
                emailType: auditType,
                status: 'sent',
            });
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(
            `[mailer] Failed to send email to ${to}: ${errorMessage}`,
        );

        // Log failed send
        if (auditType) {
            await logEmailAudit({
                userId: auditUserId,
                email: to,
                emailType: auditType,
                status: 'failed',
                errorMessage,
            });
        }

        if (throwOnError) {
            throw error;
        }
        // If throwOnError is false, silently continue (error already logged)
    }
}
