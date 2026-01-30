/**
 * @myDocBlock v2.3
 * @file PUT.test.ts
 * @internal
 * @module tests/routes/v1/auth/passreset/verify
 * @tag auth, password, reset, test
 * @version 1.0.0
 * @path tests/routes/v1/auth/passreset/verify/PUT.test.ts
 * @summary Tests PUT /v1/auth/passreset/verify endpoint.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'http'

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

import PUT from '@routes/v1/auth/passreset/verify/PUT'
import { verifyPasswordResetToken } from '@services/auth/passwordResetService'
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

describe('PUT /v1/auth/passreset/verify', () => {
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

    test('returns 400 when token is missing', async () => {
        const req = createReq({})
        const res = createRes()

        await PUT(req, res)

        expect(res.statusCode).toBe(400)
        expect(res.body).toEqual({
            error: 'INVALID_REQUEST',
            message: 'token is required',
        })
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
})
