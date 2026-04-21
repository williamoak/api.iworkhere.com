/**
 * @myDocBlock v2.3
 * @file PUT.test.ts
 * @internal
 * @module tests/routes/v1/auth/refresh
 * @tag auth, refresh, test
 * @version 1.0.0
 * @path tests/routes/v1/auth/refresh/PUT.test.ts
 * @summary Tests PUT /v1/auth/refresh endpoint glue logic.
 * @description
 * Verifies that the refresh endpoint correctly delegates to the token
 * service, returns rotated tokens on success, and translates AuthError
 * failures into HTTP responses.
 *
 * Also verifies that the endpoint exports a Zod `schema` definition for
 * request validation (used by the route loader middleware chain).
 *
 * @requires
 * {
 *   "services": [
 *     "tokenService"
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

vi.mock('@services/auth/tokenService', () => ({
    refreshTokens: vi.fn(),
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

import PUT, { schema } from '@routes/v1/auth/refresh/PUT'
import { refreshTokens } from '@services/auth/tokenService'
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
    vi.clearAllMocks()
})

/**
 * ------------------------------------------------------------
 * TESTS
 * ------------------------------------------------------------
 */

describe('PUT /v1/auth/refresh', () => {
    test('exports a Zod request schema', async () => {
        expect(schema).toBeTruthy()
        expect(schema.body).toBeTruthy()

        const parsed = schema.body.safeParse({
            refresh_token: '',
        })

        expect(parsed.success).toBe(false)
    })

    test('returns new tokens on successful refresh', async () => {
        ;(refreshTokens as any).mockResolvedValue({
            access: {
                token: 'new-access-token',
                expiresAt: new Date('2030-01-01'),
            },
            refresh: {
                token: 'new-refresh-token',
                expiresAt: new Date('2030-02-01'),
            },
        })

        const req = createReq({
            refresh_token: 'old-refresh-token',
        })
        const res = createRes()

        await PUT(req, res)

        expect(res.statusCode).toBe(200)
        expect(res.body.tokens.access.token).toBe('new-access-token')
        expect(res.body.tokens.refresh.token).toBe('new-refresh-token')

        expect(refreshTokens).toHaveBeenCalledWith('old-refresh-token')
    })

    test('translates AuthError to HTTP response', async () => {
        ;(refreshTokens as any).mockRejectedValue(
            new AuthError('INVALID_TOKEN', 'Token is invalid', 401)
        )

        const req = createReq({
            refresh_token: 'bad-token',
        })
        const res = createRes()

        await PUT(req, res)

        expect(res.statusCode).toBe(401)
        expect(res.body).toEqual({
            error: 'INVALID_TOKEN',
            message: 'Token is invalid',
        })
    })
})
