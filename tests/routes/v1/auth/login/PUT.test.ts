/**
 * @myDocBlock v2.3
 * @file PUT.test.ts
 * @internal
 * @module tests/routes/v1/auth/login
 * @tag auth, login, test
 * @version 1.0.0
 * @path tests/routes/v1/auth/login/PUT.test.ts
 * @summary Tests PUT /v1/auth/login endpoint glue logic.
 * @description
 * Verifies that the login endpoint correctly orchestrates auth services,
 * handles success responses, and translates AuthError failures into HTTP
 * responses. Auth business logic is mocked and tested separately.
 *
 * @requires
 * {
 *   "services": [
 *     "authContext",
 *     "authUserResolver",
 *     "passwordService",
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

vi.mock('@services/auth/authUserResolver', () => ({
    resolveUserForApplication: vi.fn(),
}))

vi.mock('@services/auth/passwordService', () => ({
    verifyPassword: vi.fn(),
}))

vi.mock('@services/auth/tokenService', () => ({
    issueLoginTokens: vi.fn(),
}))

/**
 * ------------------------------------------------------------
 * IMPORTS (AFTER MOCKS)
 * ------------------------------------------------------------
 */

import PUT from '@routes/v1/auth/login/PUT'
import { resolveAuthContext, AuthError } from '@services/auth/authContext'
import { resolveUserForApplication } from '@services/auth/authUserResolver'
import { verifyPassword } from '@services/auth/passwordService'
import { issueLoginTokens } from '@services/auth/tokenService'

/**
 * ------------------------------------------------------------
 * HELPERS
 * ------------------------------------------------------------
 */

function createReq(body: any): IncomingMessage {
    return ({ body } as unknown) as IncomingMessage
}

function createRes(): ServerResponse & {
    body?: any
} {
    return {
        statusCode: 0,
        headers: {} as Record<string, string>,
        setHeader(key: string, value: string) {
            ;(this.headers as any)[key] = value
        },
        end(payload: string) {
            this.body = JSON.parse(payload)
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

describe('PUT /v1/auth/login', () => {
    test('returns tokens on successful login', async () => {
        ;(resolveAuthContext as any).mockResolvedValue({
            applicationId: 'app-id',
            applicationKey: 'bill.iworkhere.com',
        })

        ;(resolveUserForApplication as any).mockResolvedValue({
            userId: 'user-id',
            username: 'bill',
            email: 'bill@example.com',
            role: 'owner',
        })

        ;(verifyPassword as any).mockResolvedValue(undefined)

        ;(issueLoginTokens as any).mockResolvedValue({
            access: {
                token: 'access-token',
                expiresAt: new Date('2030-01-01'),
            },
            refresh: {
                token: 'refresh-token',
                expiresAt: new Date('2030-02-01'),
            },
        })

        const req = createReq({
            app_key: 'bill.iworkhere.com',
            identifier: 'bill',
            password: 'password',
        })

        const res = createRes()

        await PUT(req, res)

        expect(res.statusCode).toBe(200)
        expect(res.body.user.username).toBe('bill')
        expect(res.body.tokens.access.token).toBe('access-token')
        expect(res.body.tokens.refresh.token).toBe('refresh-token')
    })

    test('translates AuthError to HTTP response', async () => {
        ;(resolveAuthContext as any).mockRejectedValue(
            new AuthError('APP_DISABLED', 'Application is disabled', 403)
        )

        const req = createReq({ app_key: 'disabled.app' })
        const res = createRes()

        await PUT(req, res)

        expect(res.statusCode).toBe(403)
        expect(res.body).toEqual({
            error: 'APP_DISABLED',
            message: 'Application is disabled',
        })
    })
})
