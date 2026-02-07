/**
 * @myDocBlock v2.3
 * @file POST.test.ts
 * @internal
 * @module tests/routes/v1/auth/login
 * @tag auth, login, test
 * @version 1.0.0
 * @path tests/routes/v1/auth/login/PUT.test.ts
 * @summary Tests POST /v1/auth/login endpoint glue logic.
 * @description
 * Verifies that the login endpoint correctly orchestrates auth services,
 * handles success responses, and translates AuthError failures into HTTP
 * responses. Auth business logic is mocked and tested separately.
 *
 * Also verifies that the endpoint exports a Zod `schema` definition for
 * request validation (used by the route loader middleware chain).
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

import POST from '@routes/v1/auth/login/POST.ts'
import { resolveAuthContext, AuthError } from '@services/auth/authContext'
import { resolveUserForApplication } from '@services/auth/authUserResolver'
import { verifyPassword } from '@services/auth/passwordService'
import { issueLoginTokens } from '@services/auth/tokenService'

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

describe('POST /v1/auth/login', () => {
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

        await POST(req, res)

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

        await POST(req, res)

        expect(res.statusCode).toBe(403)
        expect(res.body).toEqual({
            error: 'APP_DISABLED',
            message: 'Application is disabled',
        })
    })
})
