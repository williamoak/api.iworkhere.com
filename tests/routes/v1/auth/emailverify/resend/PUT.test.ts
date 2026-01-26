/**
 * @myDocBlock v2.3
 * @file PUT.test.ts
 * @internal
 * @module tests/routes/v1/auth/emailverify/resend
 * @tag auth, email, verify, resend, test
 * @version 1.0.0
 * @path tests/routes/v1/auth/emailverify/resend/PUT.test.ts
 * @summary Tests PUT /v1/auth/emailverify/resend endpoint glue logic.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'http'

/**
 * ------------------------------------------------------------
 * MOCKS — MUST APPEAR BEFORE IMPORTS
 * ------------------------------------------------------------
 */

vi.mock('@services/auth/authContext', () => ({
    resolveAuthContext: vi.fn(),
    AuthError: class AuthError extends Error {
        constructor(
            public code: string,
            public message: string,
            public httpStatus: number
        ) {
            super(message)
        }
    },
}))

vi.mock('@services/auth/emailVerificationService', () => ({
    resendEmailVerificationToken: vi.fn(),
}))

/**
 * ------------------------------------------------------------
 * IMPORTS (AFTER MOCKS)
 * ------------------------------------------------------------
 */

import PUT from '@routes/v1/auth/emailverify/resend/PUT'
import { resolveAuthContext } from '@services/auth/authContext'
import { resendEmailVerificationToken } from '@services/auth/emailVerificationService'

/**
 * ------------------------------------------------------------
 * HELPERS
 * ------------------------------------------------------------
 */

function createReq(body: any): IncomingMessage {
    return ({ body } as unknown) as IncomingMessage
}

function createRes(): ServerResponse & { body?: any } {
    return {
        statusCode: 0,
        setHeader() {},
        end(payload?: string) {
            if (payload) {
                this.body = JSON.parse(payload)
            }
        },
    } as any
}

beforeEach(() => {
    vi.resetAllMocks()
})

/**
 * ------------------------------------------------------------
 * TESTS
 * ------------------------------------------------------------
 */

describe('PUT /v1/auth/emailverify/resend', () => {
    test('calls service and returns ok', async () => {
        ;(resolveAuthContext as any).mockResolvedValue({
            applicationId: 'app-id',
        })

        const req = createReq({
            app_key: 'bill.iworkhere.com',
            email: 'user@example.com',
        })

        const res = createRes()

        await PUT(req, res)

        expect(res.statusCode).toBe(200)
        expect(res.body).toEqual({ ok: true })

        expect(resendEmailVerificationToken).toHaveBeenCalledWith({
            applicationId: 'app-id',
            email: 'user@example.com',
        })
    })

    test('still returns ok even if email is missing', async () => {
        ;(resolveAuthContext as any).mockResolvedValue({
            applicationId: 'app-id',
        })

        const req = createReq({
            app_key: 'bill.iworkhere.com',
        })

        const res = createRes()

        await PUT(req, res)

        expect(res.statusCode).toBe(200)
        expect(res.body).toEqual({ ok: true })
    })

    test('returns AuthError response if thrown', async () => {
        const { AuthError } = await import('@services/auth/authContext')

        ;(resolveAuthContext as any).mockImplementation(() => {
            throw new AuthError(
                'APP_DISABLED',
                'Application disabled',
                403
            )
        })

        const req = createReq({
            app_key: 'bill.iworkhere.com',
            email: 'user@example.com',
        })

        const res = createRes()

        await PUT(req, res)

        expect(res.statusCode).toBe(403)
        expect(res.body).toEqual({
            error: 'APP_DISABLED',
            message: 'Application disabled',
        })
    })
})
