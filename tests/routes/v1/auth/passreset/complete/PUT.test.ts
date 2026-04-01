/**
 * @myDocBlock v2.3
 * @file PUT.test.ts
 * @internal
 * @module tests/routes/v1/auth/passreset/complete
 * @tag auth, password-reset, complete, test
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path tests/routes/v1/auth/passreset/complete/PUT.test.ts
 * @summary Unit tests for PUT /v1/auth/passreset/complete endpoint glue logic.
 * @description
 * Verifies that the password reset completion endpoint:
 *   - exports a Zod `schema` for request validation
 *   - consumes middleware-validated request payload when present
 *   - calls completePasswordReset() with token and new_password
 *   - returns HTTP 200 with { ok: true } on success
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
    completePasswordReset: vi.fn(),
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

import PUT, { schema } from '@routes/v1/auth/passreset/complete/PUT'
import { completePasswordReset } from '@services/auth/passwordResetService'
import { AuthError } from '@services/auth/authContext'

/**
 * ------------------------------------------------------------
 * HELPERS
 * ------------------------------------------------------------
 */

function createReq(body: any): Request {
    return {
        body,
        validated: undefined,
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

describe('PUT /v1/auth/passreset/complete', () => {
    test('exports a Zod request schema', async () => {
        expect(schema).toBeTruthy()
        expect(schema.body).toBeTruthy()

        const parsed = schema.body.safeParse({
            token: '',
            new_password: '',
        })

        expect(parsed.success).toBe(false)
    })

    test('returns 200 and completes password reset on success', async () => {
        ;(completePasswordReset as any).mockResolvedValue(undefined)

        const req = createReq({
            token: 'valid-token',
            new_password: 'new-strong-password',
        })
        const res = createRes()

        await PUT(req, res)

        expect(res.statusCode).toBe(200)
        expect(res.body).toEqual({ ok: true })

        expect(completePasswordReset).toHaveBeenCalledWith(
            'valid-token',
            'new-strong-password'
        )
    })

    test('prefers middleware-validated body payload when present', async () => {
        ;(completePasswordReset as any).mockResolvedValue(undefined)

        const req = createReq({})
        ;(req as any).validated = {
            body: {
                token: 'valid-token',
                new_password: 'new-strong-password',
            },
        }
        const res = createRes()

        await PUT(req, res)

        expect(res.statusCode).toBe(200)
        expect(res.body).toEqual({
            ok: true,
        })
        expect(completePasswordReset).toHaveBeenCalledWith(
            'valid-token',
            'new-strong-password'
        )
    })

    test('translates AuthError to HTTP response', async () => {
        ;(completePasswordReset as any).mockRejectedValue(
            new AuthError('INVALID_TOKEN', 'Reset token is invalid', 401)
        )

        const req = createReq({
            token: 'bad-token',
            new_password: 'new-strong-password',
        })
        const res = createRes()

        await PUT(req, res)

        expect(res.statusCode).toBe(401)
        expect(res.body).toEqual({
            error: 'INVALID_TOKEN',
            message: 'Reset token is invalid',
        })
    })

    test('returns 500 for unexpected errors', async () => {
        ;(completePasswordReset as any).mockRejectedValue(new Error('boom'))

        const req = createReq({
            token: 'valid-token',
            new_password: 'new-strong-password',
        })
        const res = createRes()

        await PUT(req, res)

        expect(res.statusCode).toBe(500)
        expect(res.body).toEqual({
            error: 'INTERNAL_ERROR',
            message: 'An unexpected error occurred',
        })
    })
})
