/**
 * @myDocBlock v2.3
 * @file PUT.ts
 * @external
 * @module routes/v1/clients/joinaunion/widget
 * @tag joinaunion, widget
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path /v1/clients/joinaunion/widget
 * @summary Submit an inquiry or contact message via the JoinAUnion widget.
 * @description
 * Processes incoming widget submissions from workers inquiring about union representation
 * or workplace organizing. Validates the recipient, sender email, message content, province,
 * and industry sector, records the inquiry in joinaunion.widget_answers, and delivers the formatted inquiry notification.
 *
 * @query none
 *
 * @body
 * {
 *   "recipient": "string",
 *   "email": "string",
 *   "message": "string",
 *   "province": "string",
 *   "industry": "string"
 * }
 *
 * @requestExample
 * {
 *   "recipient": "organizer@example.com",
 *   "email": "worker@example.com",
 *   "message": "I am interested in organizing our workplace.",
 *   "province": "Ontario",
 *   "industry": "Healthcare"
 * }
 *
 * @response
 * {
 *   "ok": true,
 *   "message": "Widget inquiry submitted successfully"
 * }
 *
 * @requires
 * {
 *   "helpers": [
 *     "@helpers/mailer",
 *     "@helpers/logger"
 *   ],
 *   "services": [
 *     "@services/dbService"
 *   ],
 *   "schemas": [
 *     "@db/schema/widget_answers"
 *   ],
 *   "libraries": [
 *     "zod"
 *   ]
 * }
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { sendEmail } from '@helpers/mailer';
import { logger } from '@helpers/logger';
import { db } from '@services/dbService';
import { widgetAnswers } from '@db/schema/widget_answers';

export const authRequired = false;

/* ------------------------------------------------------------------ */
/* Types & Schemas                                                    */
/* ------------------------------------------------------------------ */

export const widgetBodySchema = z.object({
    recipient: z
        .string({ message: 'Recipient is required' })
        .trim()
        .min(1, 'Recipient cannot be empty')
        .max(255, 'Recipient cannot exceed 255 characters'),
    email: z
        .string({ message: 'Email is required' })
        .trim()
        .email('Invalid email address')
        .max(255, 'Email cannot exceed 255 characters'),
    message: z
        .string({ message: 'Message is required' })
        .trim()
        .min(1, 'Message cannot be empty')
        .max(10000, 'Message cannot exceed 10000 characters'),
    province: z
        .string({ message: 'Province is required' })
        .trim()
        .min(1, 'Province cannot be empty')
        .max(128, 'Province cannot exceed 128 characters'),
    industry: z
        .string({ message: 'Industry is required' })
        .trim()
        .min(1, 'Industry cannot be empty')
        .max(128, 'Industry cannot exceed 128 characters'),
});

export type WidgetInput = z.infer<typeof widgetBodySchema>;

export const schema = {
    body: widgetBodySchema,
};

/* ------------------------------------------------------------------ */
/* Helper Functions                                                   */
/* ------------------------------------------------------------------ */

export function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export interface MailSender {
    sendEmail(params: {
        to: string;
        subject: string;
        text: string;
        html?: string;
        throwOnError?: boolean;
    }): Promise<void>;
}

export const defaultMailSender: MailSender = {
    sendEmail: (params) => sendEmail(params),
};

export interface WidgetDatabase {
    insertWidgetAnswer(data: {
        recipient: string;
        email: string;
        message: string;
        province: string;
        industry: string;
    }): Promise<unknown>;
}

export const defaultWidgetDatabase: WidgetDatabase = {
    insertWidgetAnswer: async (data) => {
        return db.insert(widgetAnswers).values({
            recipient: data.recipient,
            email: data.email,
            message: data.message,
            province: data.province,
            industry: data.industry,
        });
    },
};

export async function processWidgetSubmission(
    input: WidgetInput,
    mailSender: MailSender = defaultMailSender,
    dbClient: WidgetDatabase = defaultWidgetDatabase,
): Promise<void> {
    const { recipient, email, message, province, industry } = input;

    await dbClient.insertWidgetAnswer({
        recipient,
        email,
        message,
        province,
        industry,
    });

    const subject = `JoinAUnion Widget Inquiry - ${province} - ${industry}`;

    const textContent = [
        `New inquiry received from JoinaUnion.ca`,
        ``,
        `From: ${email}`,
        `Recipient: ${recipient}`,
        `Province: ${province}`,
        `Industry: ${industry}`,
        ``,
        `Message:`,
        message,
    ].join('\n');

    const htmlContent = [
        `<h2>New inquiry received from JoinaUnion.ca</h2>`,
        `<p><strong>From:</strong> ${escapeHtml(email)}</p>`,
        `<p><strong>Recipient:</strong> ${escapeHtml(recipient)}</p>`,
        `<p><strong>Province:</strong> ${escapeHtml(province)}</p>`,
        `<p><strong>Industry:</strong> ${escapeHtml(industry)}</p>`,
        `<hr />`,
        `<h3>Message:</h3>`,
        `<p style="white-space: pre-wrap;">${escapeHtml(message)}</p>`,
    ].join('\n');

    await mailSender.sendEmail({
        to: recipient,
        subject,
        text: textContent,
        html: htmlContent,
        throwOnError: true,
    });
}

/* ------------------------------------------------------------------ */
/* HTTP Handler                                                       */
/* ------------------------------------------------------------------ */

export function makePutWidgetHandler(
    mailSender: MailSender = defaultMailSender,
    dbClient: WidgetDatabase = defaultWidgetDatabase,
) {
    return async function PUT(req: Request, res: Response): Promise<void> {
        try {
            const rawBody = (req.validated as { body?: unknown } | undefined)?.body ?? req.body ?? {};
            const parseResult = widgetBodySchema.safeParse(rawBody);

            if (!parseResult.success) {
                const issues = parseResult.error.issues;
                res.status(400).json({
                    error: 'INVALID_REQUEST',
                    message: issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
                    details: issues,
                });
                return;
            }

            await processWidgetSubmission(parseResult.data, mailSender, dbClient);

            res.status(200).json({
                ok: true,
                message: 'Widget inquiry submitted successfully',
            });
        } catch (err) {
            logger.error('[Widget Endpoint] Error processing widget submission:', err);
            res.status(500).json({
                error: 'INTERNAL_ERROR',
                message: 'Failed to process widget submission',
            });
        }
    };
}

const PUT = makePutWidgetHandler(defaultMailSender, defaultWidgetDatabase);
export default PUT;

/* ------------------------------------------------------------------ */
/* Test Exports                                                       */
/* ------------------------------------------------------------------ */

export const __test__ = {
    escapeHtml,
    processWidgetSubmission,
    makePutWidgetHandler,
    defaultMailSender,
    defaultWidgetDatabase,
};
