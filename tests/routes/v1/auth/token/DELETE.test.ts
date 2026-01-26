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
import type { IncomingMessage, ServerResponse } from 'http'

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

import DELETE from '@routes/v1/auth/token/DELETE'
import { revokeToken } from '@services/auth/tokenService'
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
            if (payload) this.body = JSON.parse(payload)
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

describe('DELETE /v1/auth/token', () => {
    test('returns 204 on successful revoke', async () => {
        ;(revokeToken as any).mockResolvedValue(undefined)

        const req = createReq({ token: 'some-token' })
        const res = createRes()

        await DELETE(req, res)

        expect(res.statusCode).toBe(204)
        expect(revokeToken).toHaveBeenCalledWith('some-token')
    })

    test('is idempotent when token is missing', async () => {
        ;(revokeToken as any).mockResolvedValue(undefined)

        const req = createReq({})
        const res = createRes()

        await DELETE(req, res)

        expect(res.statusCode).toBe(204)
        expect(revokeToken).toHaveBeenCalledWith(undefined)
    })

    test('translates AuthError to HTTP response', async () => {
        ;(revokeToken as any).mockRejectedValue(
            new AuthError('TOKEN_INVALID', 'Token is invalid', 401)
        )

        const req = createReq({ token: 'bad-token' })
        const res = createRes()

        await DELETE(req, res)

        expect(res.statusCode).toBe(401)
        expect(res.body).toEqual({
            error: 'TOKEN_INVALID',
            message: 'Token is invalid',
        })
    })
})
