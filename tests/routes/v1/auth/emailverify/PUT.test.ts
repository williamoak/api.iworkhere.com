/**
 * @myDocBlock v2.3
 * @file PUT.test.ts
 * @internal
 * @module tests/routes/v1/auth/emailverify
 * @tag auth, email, verify, test
 * @version 1.0.0
 * @path tests/routes/v1/auth/emailverify/PUT.test.ts
 * @summary Tests PUT /v1/auth/emailverify endpoint glue logic.
 * @description
 * Verifies that the email verification endpoint delegates to the
 * emailVerificationService and translates service errors into HTTP
 * responses correctly.
 *
 * @requires
 * {
 *   "services": [
 *     "emailVerificationService"
 *   ]
 * }
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'http'

/**
 * ------------------------------------------------------------
 * MOCKS — MUST APPEAR BEFORE IMPORTS
 * ------------------------------------------------------------
 */

vi.mock('@services/auth/emailVerificationService', () => ({
    verifyEmailToken: vi.fn(),
}))

vi.mock('@services/auth/authContext', () => ({
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

/**
 * ------------------------------------------------------------
 * IMPORTS (AFTER MOCKS)
 * ------------------------------------------------------------
 */

import PUT from '@routes/v1/auth/emailverify/PUT'
import { verifyEmailToken } from '@services/auth/emailVerificationService'
import { AuthError } from '@services/auth/authContext'

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
        headers: {} as Record<string, string>,
        setHeader(key: string, value: string) {
            ;(this.headers as any)[key] = value
        },
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

describe('PUT /v1/auth/emailverify', () => {
    test('returns 200 and user info on successful verification', async () => {
        ;(verifyEmailToken as any).mockResolvedValue({
            id: 'user-id',
            email: 'user@example.com',
        })

        const req = createReq({ token: 'valid-token' })
        const res = createRes()

        await PUT(req, res)

        expect(res.statusCode).toBe(200)
        expect(res.body).toEqual({
            user: {
                id: 'user-id',
                email: 'user@example.com',
                status: 'active',
            },
        })

        expect(verifyEmailToken).toHaveBeenCalledWith('valid-token')
    })

    test('returns 400 if token is missing', async () => {
        const req = createReq({})
        const res = createRes()

        await PUT(req, res)

        expect(res.statusCode).toBe(400)
        expect(res.body).toEqual({
            error: 'INVALID_REQUEST',
            message: 'verification token is required',
        })
    })

    test('translates AuthError to HTTP response', async () => {
        ;(verifyEmailToken as any).mockRejectedValue(
            new AuthError('TOKEN_INVALID', 'Token is invalid', 401)
        )

        const req = createReq({ token: 'bad-token' })
        const res = createRes()

        await PUT(req, res)

        expect(res.statusCode).toBe(401)
        expect(res.body).toEqual({
            error: 'TOKEN_INVALID',
            message: 'Token is invalid',
        })
    })
})
