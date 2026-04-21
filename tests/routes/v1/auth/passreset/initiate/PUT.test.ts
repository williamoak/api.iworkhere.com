/**
 * @myDocBlock v2.3
 * @file PUT.test.ts
 * @internal
 * @module tests/routes/v1/auth/passreset/initiate
 * @tag auth, password-reset, initiate, test
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path tests/routes/v1/auth/passreset/initiate/PUT.test.ts
 * @summary Unit tests for PUT /v1/auth/passreset/initiate endpoint glue logic.
 * @description
 * Verifies that the password reset initiate endpoint:
 *   - exports a Zod `schema` for request validation
 *   - consumes middleware-validated request payload when present
 *   - resolves auth context before initiating reset
 *   - initiates password reset and returns HTTP 200 with { status: "ok" }
 *   - translates AuthError failures into HTTP responses
 *   - returns HTTP 500 for unexpected errors
 *
 * @query
 *   {}
 *
 * @requires
 * {
 *   "services": [
 *     "authContext",
 *     "passwordResetService"
 *   }
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

vi.mock('@services/auth/passwordResetService', () => ({
    initiatePasswordReset: vi.fn(),
}))

/**
 * ------------------------------------------------------------
 * IMPORTS (AFTER MOCKS)
 * ------------------------------------------------------------
 */

import PUT, { schema } from '@routes/v1/auth/passreset/initiate/PUT'
import { resolveAuthContext, AuthError } from '@services/auth/authContext'
import { initiatePasswordReset } from '@services/auth/passwordResetService'

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

describe('PUT /v1/auth/passreset/initiate', () => {
    test('exports a Zod request schema', async () => {
        expect(schema).toBeTruthy()
        expect(schema.body).toBeTruthy()

        const parsed = schema.body.safeParse({
            app_key: 'bill.iworkhere.com',
            email: 'not-an-email',
        })

        expect(parsed.success).toBe(false)
    })

    test('returns 200 and initiates password reset on success (email is trimmed)', async () => {
        ;(resolveAuthContext as any).mockResolvedValue({
            applicationId: 'app-id',
            applicationKey: 'bill.iworkhere.com',
        })

        ;(initiatePasswordReset as any).mockResolvedValue(undefined)

        const req = createReq({
            app_key: 'bill.iworkhere.com',
            email: 'user@example.com',
        })

        const res = createRes()

        await PUT(req, res)

        expect(res.statusCode).toBe(200)
        expect(res.body).toEqual({ status: 'ok' })

        expect(resolveAuthContext).toHaveBeenCalledWith({
            app_key: 'bill.iworkhere.com',
            email:   'user@example.com',
        })

        expect(initiatePasswordReset).toHaveBeenCalledWith('user@example.com')
    })

    test('prefers middleware-validated body payload when present', async () => {
        ;(resolveAuthContext as any).mockResolvedValue({
            applicationId: 'app-id',
            applicationKey: 'bill.iworkhere.com',
        })

        ;(initiatePasswordReset as any).mockResolvedValue(undefined)

        const req = createReq({})
        ;(req as any).validated = {
            body: {
                app_key: 'bill.iworkhere.com',
                email: 'user@example.com',
            },
        }

        const res = createRes()

        await PUT(req, res)

        expect(res.statusCode).toBe(200)
        expect(res.body).toEqual({
            status: 'ok',
        })

        expect(resolveAuthContext).toHaveBeenCalledWith({
            app_key: 'bill.iworkhere.com',
            email: 'user@example.com',
        })
        expect(initiatePasswordReset).toHaveBeenCalledWith('user@example.com')
    })

    test('translates AuthError to HTTP response', async () => {
        ;(resolveAuthContext as any).mockRejectedValue(
            new AuthError('APP_NOT_FOUND', 'Application not found', 401)
        )

        const req = createReq({
            app_key: 'unknown-app',
            email: 'user@example.com',
        })

        const res = createRes()

        await PUT(req, res)

        expect(res.statusCode).toBe(401)
        expect(res.body).toEqual({
            error: 'APP_NOT_FOUND',
            message: 'Application not found',
        })

        expect(initiatePasswordReset).not.toHaveBeenCalled()
    })

    test('returns 500 for unexpected errors', async () => {
        ;(resolveAuthContext as any).mockResolvedValue({
            applicationId: 'app-id',
            applicationKey: 'bill.iworkhere.com',
        })

        ;(initiatePasswordReset as any).mockRejectedValue(
            new Error('boom')
        )

        const req = createReq({
            app_key: 'bill.iworkhere.com',
            email: 'user@example.com',
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
