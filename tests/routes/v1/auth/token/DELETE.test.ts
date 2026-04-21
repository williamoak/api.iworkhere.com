/**
 * @myDocBlock v2.3
 * @file DELETE.test.ts
 * @internal
 * @module tests/routes/v1/auth/token
 * @tag auth, logout, test
 * @version 1.0.0
 * @path tests/routes/v1/auth/token/DELETE.test.ts
 * @summary Tests DELETE /v1/auth/token endpoint glue logic.
 * @description
 * Verifies that the token revoke endpoint delegates to tokenService,
 * returns 204 on success, and translates AuthError failures.
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
    revokeToken: vi.fn(),
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

import DELETE, { schema } from '@routes/v1/auth/token/DELETE'
import { revokeToken } from '@services/auth/tokenService'
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

describe('DELETE /v1/auth/token', () => {
    test('exports a Zod request schema', async () => {
        expect(schema).toBeTruthy()
        expect(schema.body).toBeTruthy()

        const missing = schema.body.safeParse({})
        expect(missing.success).toBe(false)

        const empty = schema.body.safeParse({ token: '' })
        expect(empty.success).toBe(false)
    })

    test('returns 204 on successful revoke', async () => {
        ;(revokeToken as any).mockResolvedValue(undefined)

        const req = createReq({ token: 'some-token' })
        const res = createRes()

        await DELETE(req, res)

        expect(res.statusCode).toBe(204)
        expect(revokeToken).toHaveBeenCalledWith('some-token')
    })

    test('translates AuthError to HTTP response', async () => {
        ;(revokeToken as any).mockRejectedValue(
            new AuthError('INVALID_TOKEN', 'Token is invalid', 401)
        )

        const req = createReq({ token: 'bad-token' })
        const res = createRes()

        await DELETE(req, res)

        expect(res.statusCode).toBe(401)
        expect(res.body).toEqual({
            error: 'INVALID_TOKEN',
            message: 'Token is invalid',
        })
    })
})
