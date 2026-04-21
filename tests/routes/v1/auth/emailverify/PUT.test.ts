/**
 * @myDocBlock v2.3
 * @file PUT.test.ts
 * @internal
 * @module tests/routes/v1/auth/emailverify
 * @tag auth, email, verify, test
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path tests/routes/v1/auth/emailverify/PUT.test.ts
 * @summary Tests PUT /v1/auth/emailverify endpoint glue logic.
 * @description
 * Verifies that the email verification endpoint delegates to the
 * emailVerificationService and translates service errors into HTTP
 * responses correctly.
 *
 * Also verifies that the endpoint exports a Zod `schema` definition for
 * request validation (used by the route loader middleware chain).
 *
 * @requires
 * {
 *   "services": [
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

import PUT, { schema } from '@routes/v1/auth/emailverify/PUT'
import { verifyEmailToken } from '@services/auth/emailVerificationService'
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
    vi.clearAllMocks()
})

/**
 * ------------------------------------------------------------
 * TESTS
 * ------------------------------------------------------------
 */

describe('PUT /v1/auth/emailverify', () => {
    test('exports a Zod request schema', async () => {
        expect(schema).toBeTruthy()
        expect(schema.body).toBeTruthy()

        const parsed = schema.body.safeParse({ token: '' })
        expect(parsed.success).toBe(false)
    })

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

    test('prefers middleware-validated body payload when present', async () => {
        ;(verifyEmailToken as any).mockResolvedValue({
            id: 'user-id',
            email: 'user@example.com',
        })

        const req = createReq({})
        ;(req as any).validated = {
            body: { token: 'valid-token' },
        }
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

    test('translates AuthError to HTTP response', async () => {
        ;(verifyEmailToken as any).mockRejectedValue(
            new AuthError('INVALID_TOKEN', 'Token is invalid', 401)
        )

        const req = createReq({ token: 'bad-token' })
        const res = createRes()

        await PUT(req, res)

        expect(res.statusCode).toBe(401)
        expect(res.body).toEqual({
            error: 'INVALID_TOKEN',
            message: 'Token is invalid',
        })
    })
})
