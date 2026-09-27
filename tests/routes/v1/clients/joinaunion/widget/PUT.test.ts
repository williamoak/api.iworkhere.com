/**
 * @myDocBlock v2.3
 * @file PUT.test.ts
 * @internal
 * @module tests/routes/v1/clients/joinaunion/widget
 * @tag joinaunion, widget, test
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path tests/routes/v1/clients/joinaunion/widget/PUT.test.ts
 * @summary Unit and integration tests for JoinAUnion widget PUT endpoint.
 * @description
 * Tests schema validation, email content formatting, HTML sanitization,
 * error handling, and HTTP status codes for the widget inquiry submission endpoint.
 *
 * @requires
 * {
 *   "routes": ["@routes/v1/clients/joinaunion/widget/PUT"],
 *   "helpers": ["@helpers/mailer"]
 * }
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

const { mockInsert, mockValues } = vi.hoisted(() => ({
    mockInsert: vi.fn(),
    mockValues: vi.fn(),
}));

vi.mock('@services/dbService', async () => {
    const { createDbServiceMock } = await import('../../../../../helpers/dbMock');
    mockInsert.mockReturnValue({ values: mockValues });
    return createDbServiceMock({
        insert: mockInsert,
    });
});

import PUT, {
    authRequired,
    schema,
    widgetBodySchema,
    escapeHtml,
    processWidgetSubmission,
    makePutWidgetHandler,
    defaultMailSender,
    defaultWidgetDatabase,
    __test__,
} from '@routes/v1/clients/joinaunion/widget/PUT';
import * as mailer from '@helpers/mailer';
import { db } from '@services/dbService';

type ResMock = Response & {
    statusCode: number;
    body: unknown;
};

function createReq(body: unknown, validatedBody?: unknown): Request {
    return {
        body,
        validated: validatedBody ? { body: validatedBody } : undefined,
    } as unknown as Request;
}

function createRes(): ResMock {
    const res: Partial<ResMock> = {
        statusCode: 200,
        body: undefined,
    };
    res.status = vi.fn((code: number) => {
        res.statusCode = code;
        return res as Response;
    });
    res.json = vi.fn((data: unknown) => {
        res.body = data;
        return res as Response;
    });
    return res as ResMock;
}

describe('PUT /v1/clients/joinaunion/widget', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe('Route configuration & Schema', () => {
        it('exports authRequired as false for public widget access', () => {
            expect(authRequired).toBe(false);
        });

        it('exports schema with body definition matching widgetBodySchema', () => {
            expect(schema.body).toBe(widgetBodySchema);
        });

        it('validates a correct payload', () => {
            const valid = {
                recipient: 'organizer@example.com',
                email: 'worker@example.com',
                message: 'We need advice on organizing.',
                province: 'Ontario',
                industry: 'Manufacturing',
            };
            const result = widgetBodySchema.safeParse(valid);
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toEqual(valid);
            }
        });

        it('rejects invalid or missing fields', () => {
            expect(widgetBodySchema.safeParse({}).success).toBe(false);

            // Invalid email
            expect(
                widgetBodySchema.safeParse({
                    recipient: 'organizer@example.com',
                    email: 'not-an-email',
                    message: 'Hello',
                    province: 'BC',
                    industry: 'Tech',
                }).success,
            ).toBe(false);

            // Empty strings
            expect(
                widgetBodySchema.safeParse({
                    recipient: '   ',
                    email: 'test@example.com',
                    message: 'Hello',
                    province: 'BC',
                    industry: 'Tech',
                }).success,
            ).toBe(false);
        });
    });

    describe('escapeHtml utility', () => {
        it('properly escapes HTML special characters', () => {
            expect(escapeHtml('<script>alert("xss & \'injection\'")</script>')).toBe(
                '&lt;script&gt;alert(&quot;xss &amp; &#39;injection&#39;&quot;)&lt;/script&gt;',
            );
            expect(escapeHtml('Clean string')).toBe('Clean string');
        });
    });

    describe('processWidgetSubmission', () => {
        it('formats subject, text, and html, inserts into database, and delivers through mailSender', async () => {
            const mockSend = vi.fn().mockResolvedValue(undefined);
            const mockInsert = vi.fn().mockResolvedValue(undefined);
            const mockSender = { sendEmail: mockSend };
            const mockDb = { insertWidgetAnswer: mockInsert };

            const input = {
                recipient: 'organizer@example.com',
                email: 'worker@example.com',
                message: 'I want to organize a union at my workplace.\nMultiple lines test.',
                province: 'British Columbia',
                industry: 'Retail & Hospitality',
            };

            await processWidgetSubmission(input, mockSender, mockDb);

            expect(mockInsert).toHaveBeenCalledTimes(1);
            expect(mockInsert).toHaveBeenCalledWith(input);

            expect(mockSend).toHaveBeenCalledTimes(1);
            const callArgs = mockSend.mock.calls[0][0];
            expect(callArgs.to).toBe('organizer@example.com');
            expect(callArgs.subject).toBe(
                'JoinAUnion Widget Inquiry - British Columbia - Retail & Hospitality',
            );
            expect(callArgs.text).toContain('New inquiry received from JoinaUnion.ca');
            expect(callArgs.text).toContain('From: worker@example.com');
            expect(callArgs.text).toContain('Province: British Columbia');
            expect(callArgs.text).toContain('Industry: Retail & Hospitality');
            expect(callArgs.text).toContain('Recipient: organizer@example.com');
            expect(callArgs.text).toContain('I want to organize a union at my workplace.');
            expect(callArgs.html).toContain('<h2>New inquiry received from JoinaUnion.ca</h2>');
            expect(callArgs.html).toContain('<p><strong>From:</strong> worker@example.com');
            expect(callArgs.html).toContain('Retail &amp; Hospitality');
            expect(callArgs.throwOnError).toBe(true);
        });
    });

    describe('defaultMailSender and defaultWidgetDatabase', () => {
        it('delegates to mailer.sendEmail', async () => {
            const spy = vi.spyOn(mailer, 'sendEmail').mockResolvedValue(undefined);
            await defaultMailSender.sendEmail({
                to: 'test@example.com',
                subject: 'Test',
                text: 'Body',
            });
            expect(spy).toHaveBeenCalledWith({
                to: 'test@example.com',
                subject: 'Test',
                text: 'Body',
            });
        });

        it('delegates defaultWidgetDatabase to db.insert', async () => {
            mockValues.mockResolvedValue(undefined);
            mockInsert.mockReturnValue({ values: mockValues });

            await defaultWidgetDatabase.insertWidgetAnswer({
                recipient: 'rep@union.org',
                email: 'worker@domain.com',
                message: 'Hello',
                province: 'Alberta',
                industry: 'Energy',
            });

            expect(mockInsert).toHaveBeenCalled();
            expect(mockValues).toHaveBeenCalledWith({
                recipient: 'rep@union.org',
                email: 'worker@domain.com',
                message: 'Hello',
                province: 'Alberta',
                industry: 'Energy',
            });
        });
    });

    describe('HTTP Handler execution', () => {
        it('returns 200 with success message on valid submission', async () => {
            const mockSend = vi.fn().mockResolvedValue(undefined);
            const mockDb = vi.fn().mockResolvedValue(undefined);
            const handler = makePutWidgetHandler({ sendEmail: mockSend }, { insertWidgetAnswer: mockDb });

            const req = createReq({
                recipient: 'rep@union.org',
                email: 'jane.doe@workplace.com',
                message: 'Interested in representation.',
                province: 'Alberta',
                industry: 'Healthcare',
            });
            const res = createRes();

            await handler(req, res);

            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({
                ok: true,
                message: 'Widget inquiry submitted successfully',
            });
            expect(mockSend).toHaveBeenCalledTimes(1);
            expect(mockDb).toHaveBeenCalledTimes(1);
            expect(mockDb).toHaveBeenCalledWith({
                recipient: 'rep@union.org',
                email: 'jane.doe@workplace.com',
                message: 'Interested in representation.',
                province: 'Alberta',
                industry: 'Healthcare',
            });
        });

        it('accepts pre-validated body from req.validated.body', async () => {
            const mockSend = vi.fn().mockResolvedValue(undefined);
            const mockDb = vi.fn().mockResolvedValue(undefined);
            const handler = makePutWidgetHandler({ sendEmail: mockSend }, { insertWidgetAnswer: mockDb });

            const validatedPayload = {
                recipient: 'rep@union.org',
                email: 'jane.doe@workplace.com',
                message: 'Interested in representation.',
                province: 'Alberta',
                industry: 'Healthcare',
            };
            const req = createReq({}, validatedPayload);
            const res = createRes();

            await handler(req, res);

            expect(res.statusCode).toBe(200);
            expect(mockSend).toHaveBeenCalledTimes(1);
            expect(mockDb).toHaveBeenCalledTimes(1);
        });

        it('returns 400 INVALID_REQUEST when body is missing required fields', async () => {
            const mockSend = vi.fn();
            const mockDb = vi.fn();
            const handler = makePutWidgetHandler({ sendEmail: mockSend }, { insertWidgetAnswer: mockDb });

            const req = createReq({
                recipient: 'rep@union.org',
                // missing email, message, province, industry
            });
            const res = createRes();

            await handler(req, res);

            expect(res.statusCode).toBe(400);
            expect(res.body).toMatchObject({
                error: 'INVALID_REQUEST',
            });
            expect(mockSend).not.toHaveBeenCalled();
            expect(mockDb).not.toHaveBeenCalled();
        });

        it('returns 400 INVALID_REQUEST when email is malformed', async () => {
            const mockSend = vi.fn();
            const mockDb = vi.fn();
            const handler = makePutWidgetHandler({ sendEmail: mockSend }, { insertWidgetAnswer: mockDb });

            const req = createReq({
                recipient: 'rep@union.org',
                email: 'invalid-email-address',
                message: 'Hello',
                province: 'Quebec',
                industry: 'Construction',
            });
            const res = createRes();

            await handler(req, res);

            expect(res.statusCode).toBe(400);
            expect((res.body as { message: string }).message).toContain('Invalid email address');
            expect(mockSend).not.toHaveBeenCalled();
            expect(mockDb).not.toHaveBeenCalled();
        });

        it('returns 500 INTERNAL_ERROR when email delivery throws', async () => {
            const mockSend = vi.fn().mockRejectedValue(new Error('SMTP connection failure'));
            const mockDb = vi.fn().mockResolvedValue(undefined);
            const handler = makePutWidgetHandler({ sendEmail: mockSend }, { insertWidgetAnswer: mockDb });

            const req = createReq({
                recipient: 'rep@union.org',
                email: 'worker@workplace.com',
                message: 'Contact us.',
                province: 'Manitoba',
                industry: 'Education',
            });
            const res = createRes();

            await handler(req, res);

            expect(res.statusCode).toBe(500);
            expect(res.body).toEqual({
                error: 'INTERNAL_ERROR',
                message: 'Failed to process widget submission',
            });
        });

        it('returns 500 INTERNAL_ERROR when database insert throws', async () => {
            const mockSend = vi.fn().mockResolvedValue(undefined);
            const mockDb = vi.fn().mockRejectedValue(new Error('Database error'));
            const handler = makePutWidgetHandler({ sendEmail: mockSend }, { insertWidgetAnswer: mockDb });

            const req = createReq({
                recipient: 'rep@union.org',
                email: 'worker@workplace.com',
                message: 'Contact us.',
                province: 'Manitoba',
                industry: 'Education',
            });
            const res = createRes();

            await handler(req, res);

            expect(res.statusCode).toBe(500);
            expect(res.body).toEqual({
                error: 'INTERNAL_ERROR',
                message: 'Failed to process widget submission',
            });
        });

        it('default exported PUT handler works end-to-end', async () => {
            vi.spyOn(mailer, 'sendEmail').mockResolvedValue(undefined);
            mockValues.mockResolvedValue(undefined);
            mockInsert.mockReturnValue({ values: mockValues });

            const req = createReq({
                recipient: 'rep@union.org',
                email: 'worker@workplace.com',
                message: 'Contact us.',
                province: 'Manitoba',
                industry: 'Education',
            });
            const res = createRes();

            await PUT(req, res);

            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({
                ok: true,
                message: 'Widget inquiry submitted successfully',
            });
            expect(mockInsert).toHaveBeenCalled();
            expect(mockValues).toHaveBeenCalledWith({
                recipient: 'rep@union.org',
                email: 'worker@workplace.com',
                message: 'Contact us.',
                province: 'Manitoba',
                industry: 'Education',
            });
        });
    });

    describe('Test exports', () => {
        it('exports internal helpers under __test__', () => {
            expect(__test__.escapeHtml).toBe(escapeHtml);
            expect(__test__.processWidgetSubmission).toBe(processWidgetSubmission);
            expect(__test__.makePutWidgetHandler).toBe(makePutWidgetHandler);
            expect(__test__.defaultMailSender).toBe(defaultMailSender);
            expect(__test__.defaultWidgetDatabase).toBe(defaultWidgetDatabase);
        });
    });
});
