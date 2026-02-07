/**
 * @myDocBlock v2.3
 * @file PUT.test.ts
 * @internal
 * @module tests/routes/v1/auth/passreset/verify
 * @tag auth, password-reset, verify, test
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path tests/routes/v1/auth/passreset/verify/PUT.test.ts
 * @summary Unit tests for PUT /v1/auth/passreset/verify endpoint glue logic.
 * @description
 * Verifies that the password reset token verification endpoint:
 *   - exports a Zod `schema` for request validation
 *   - returns HTTP 400 for invalid request bodies
 *   - calls verifyPasswordResetToken() with the provided token
 *   - returns HTTP 200 with { valid: true } on success
 *   - translates AuthError failures into HTTP responses
 *   - returns HTTP 500 for unexpected errors
 *
 * @query
 *   {}
 *
 * @requires
 * {
 *   "services": [
 *     "passwordResetService",
 *     "authContext"
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

vi.mock('@services/auth/passwordResetService', () => ({
    verifyPasswordResetToken: vi.fn(),
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

import PUT, { schema } from '@routes/v1/auth/passreset/verify/PUT'
import { verifyPasswordResetToken } from '@services/auth/passwordResetService'
import { AuthError } from '@services/auth/authContext'

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

describe('PUT /v1/auth/passreset/verify', () => {
    test('exports a Zod request schema', async () => {
        expect(schema).toBeTruthy()
        expect(schema.body).toBeTruthy()

        const parsed = schema.body.safeParse({
            token: '',
        })

        expect(parsed.success).toBe(false)
    })

    test('returns 200 when token is valid', async () => {
        ;(verifyPasswordResetToken as any).mockResolvedValue({
            userId: 'u1',
        })

        const req = createReq({ token: 'valid-token' })
        const res = createRes()

        await PUT(req, res)

        expect(res.statusCode).toBe(200)
        expect(res.body).toEqual({ valid: true })
        expect(verifyPasswordResetToken).toHaveBeenCalledWith('valid-token')
    })

    test('returns 400 for invalid request body (missing token)', async () => {
        const req = createReq({})
        const res = createRes()

        await PUT(req, res)

        expect(res.statusCode).toBe(400)
        expect(res.body).toEqual({
            error: 'INVALID_REQUEST',
            message: 'Invalid request body',
        })

        expect(verifyPasswordResetToken).not.toHaveBeenCalled()
    })

    test('translates AuthError to HTTP response', async () => {
        ;(verifyPasswordResetToken as any).mockRejectedValue(
            new AuthError('INVALID_TOKEN', 'Reset token is invalid', 401)
        )

        const req = createReq({ token: 'bad-token' })
        const res = createRes()

        await PUT(req, res)

        expect(res.statusCode).toBe(401)
        expect(res.body).toEqual({
            error: 'INVALID_TOKEN',
            message: 'Reset token is invalid',
        })
    })

    test('returns 500 for unexpected errors', async () => {
        ;(verifyPasswordResetToken as any).mockRejectedValue(new Error('boom'))

        const req = createReq({ token: 'valid-token' })
        const res = createRes()

        await PUT(req, res)

        expect(res.statusCode).toBe(500)
        expect(res.body).toEqual({
            error: 'INTERNAL_ERROR',
            message: 'An unexpected error occurred',
        })
    })
})
