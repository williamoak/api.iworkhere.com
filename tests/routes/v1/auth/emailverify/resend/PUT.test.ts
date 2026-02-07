/**
 * @myDocBlock v2.3
 * @file PUT.test.ts
 * @internal
 * @module tests/routes/v1/auth/emailverify/resend
 * @tag auth, email, verify, resend, test
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path tests/routes/v1/auth/emailverify/resend/PUT.test.ts
 * @summary Tests PUT /v1/auth/emailverify/resend endpoint glue logic.
 * @description
 * Verifies that the resend endpoint delegates to authContext and the
 * emailVerificationService, returns ok on success, and translates AuthError
 * failures into HTTP responses.
 *
 * Also verifies that the endpoint exports a Zod `schema` definition for request
 * validation (used by the route loader middleware chain).
 *
 * @requires
 * {
 *   "services": [
 *     "authContext",
 *     "emailVerificationService"
 *   ]
 * }
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { Request, Response } from 'express'

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

import PUT, { schema } from '@routes/v1/auth/emailverify/resend/PUT'
import { resolveAuthContext } from '@services/auth/authContext'
import { resendEmailVerificationToken } from '@services/auth/emailVerificationService'

/**
 * ------------------------------------------------------------
 * HELPERS
 * ------------------------------------------------------------
 */

function createReq(body: any): Request {
    return {
        body,
    } as unknown as Request
}

type ResMock = Response & {
    statusCode: number
    body?: any
    headers: Record<string, string>
}

function createRes(): ResMock {
    const res = {
        statusCode: 0,
        body: undefined,
        headers: {} as Record<string, string>,

        status(code: number) {
            this.statusCode = code
            return this
        },

        json(payload: any) {
            this.body = payload
            return this
        },

        setHeader(key: string, value: string) {
            this.headers[key] = value
        },

        end() {
            return this
        },
    }

    return res as unknown as ResMock
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
    test('exports a Zod request schema', async () => {
        expect(schema).toBeTruthy()
        expect(schema.body).toBeTruthy()

        const missingAppKey = schema.body.safeParse({ email: 'user@example.com' })
        expect(missingAppKey.success).toBe(false)

        const missingEmailIsAllowed = schema.body.safeParse({
            app_key: 'bill.iworkhere.com',
        })
        expect(missingEmailIsAllowed.success).toBe(true)
    })

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
