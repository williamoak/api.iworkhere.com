/**
 * @myDocBlock v2.3
 * @file PUT.test.ts
 * @internal
 * @module tests/routes/v1/auth/emailverify/resend
 * @tag auth, email, verify, test
 * @version 1.0.0
 * @path tests/routes/v1/auth/emailverify/resend/PUT.test.ts
 * @summary Tests PUT /v1/auth/emailverify/resend endpoint glue logic.
 * @description
 * Verifies that the resend-email endpoint correctly resolves auth context,
 * forwards the application ID and email to the resend service, handles
 * non-enumerating behavior, and translates AuthError failures into HTTP
 * responses. Business logic is mocked and tested separately.
 *
 * Also verifies that the endpoint exports a Zod `schema` definition for
 * request validation.
 *
 * @requires
 * {
 *   "services": [
 *     "authContext",
 *     "emailVerificationService"
 *   ]
 * }
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

import PUT, { schema } from '@routes/v1/auth/emailverify/resend/PUT';
import { AuthError, resolveAuthContext } from '@services/auth/authContext';
import {
    resendEmailVerificationToken,
} from '@services/auth/emailVerificationService';

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
    return {
        statusCode: 0,
        body: undefined,
        status(code: number) {
            this.statusCode = code;
            return this;
        },
        json(payload: unknown) {
            this.body = payload;
            return this;
        },
    } as ResMock;
}

describe('PUT /v1/auth/emailverify/resend', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('exports a request body schema', () => {
        expect(schema).toBeDefined();
        expect(schema.body).toBeDefined();
    });

    it('returns ok on success', async () => {
        vi.mocked(resolveAuthContext).mockResolvedValue({
            applicationId: 'app-123',
            applicationKey: 'example-app-key',
        } as any);

        vi.mocked(resendEmailVerificationToken).mockResolvedValue(undefined);

        const req = createReq({
            app_key: 'example-app-key',
            email: 'user@example.com',
        });
        const res = createRes();

        await PUT(req, res);

        expect(resolveAuthContext).toHaveBeenCalledWith({
            app_key: 'example-app-key',
            email: 'user@example.com',
        });
        expect(resendEmailVerificationToken).toHaveBeenCalledWith({
            applicationId: 'app-123',
            email: 'user@example.com',
        });

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ ok: true });
    });

    it('uses req.validated.body when present', async () => {
        vi.mocked(resolveAuthContext).mockResolvedValue({
            applicationId: 'app-456',
            applicationKey: 'validated.example.com',
        } as any);

        vi.mocked(resendEmailVerificationToken).mockResolvedValue(undefined);

        const validatedBody = {
            app_key: 'validated.example.com',
            email: 'validated@example.com',
        };

        const req = createReq(
            {
                app_key: 'ignored.example.com',
                email: 'ignored@example.com',
            },
            validatedBody,
        );
        const res = createRes();

        await PUT(req, res);

        expect(resolveAuthContext).toHaveBeenCalledWith(validatedBody);
        expect(resendEmailVerificationToken).toHaveBeenCalledWith({
            applicationId: 'app-456',
            email: 'validated@example.com',
        });
        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ ok: true });
    });

    it('allows missing email and still returns ok', async () => {
        vi.mocked(resolveAuthContext).mockResolvedValue({
            applicationId: 'app-789',
            applicationKey: 'example-app-key',
        } as any);

        vi.mocked(resendEmailVerificationToken).mockResolvedValue(undefined);

        const req = createReq({
            app_key: 'example-app-key',
            email: undefined,
        });
        const res = createRes();

        await PUT(req, res);

        expect(resendEmailVerificationToken).toHaveBeenCalledWith({
            applicationId: 'app-789',
            email: undefined,
        });
        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ ok: true });
    });

    it('allows blank email and still returns ok', async () => {
        vi.mocked(resolveAuthContext).mockResolvedValue({
            applicationId: 'app-321',
            applicationKey: 'example-app-key',
        } as any);

        vi.mocked(resendEmailVerificationToken).mockResolvedValue(undefined);

        const req = createReq({
            app_key: 'example-app-key',
            email: '',
        });
        const res = createRes();

        await PUT(req, res);

        expect(resendEmailVerificationToken).toHaveBeenCalledWith({
            applicationId: 'app-321',
            email: '',
        });
        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ ok: true });
    });

    it('returns AuthError response when resolveAuthContext throws AuthError', async () => {
        vi.mocked(resolveAuthContext).mockRejectedValue(
            new AuthError('INVALID_APP', 'Invalid application', 400),
        );

        const req = createReq({
            app_key: 'bad-app',
            email: 'user@example.com',
        });
        const res = createRes();

        await PUT(req, res);

        expect(res.statusCode).toBe(400);
        expect(res.body).toEqual({
            error: 'INVALID_APP',
            message: 'Invalid application',
        });
    });

    it('returns AuthError response when resend service throws AuthError', async () => {
        vi.mocked(resolveAuthContext).mockResolvedValue({
            applicationId: 'app-123',
            applicationKey: 'example-app-key',
        } as any);

        vi.mocked(resendEmailVerificationToken).mockRejectedValue(
            new AuthError('EMAIL_NOT_ALLOWED', 'Email not eligible for resend', 403),
        );

        const req = createReq({
            app_key: 'example-app-key',
            email: 'user@example.com',
        });
        const res = createRes();

        await PUT(req, res);

        expect(res.statusCode).toBe(403);
        expect(res.body).toEqual({
            error: 'EMAIL_NOT_ALLOWED',
            message: 'Email not eligible for resend',
        });
    });

    it('returns 500 on unexpected errors', async () => {
        vi.mocked(resolveAuthContext).mockRejectedValue(new Error('boom'));

        const req = createReq({
            app_key: 'example-app-key',
            email: 'user@example.com',
        });
        const res = createRes();

        await PUT(req, res);

        expect(res.statusCode).toBe(500);
        expect(res.body).toEqual({
            error: 'INTERNAL_ERROR',
            message: 'An unexpected error occurred',
        });
    });
});