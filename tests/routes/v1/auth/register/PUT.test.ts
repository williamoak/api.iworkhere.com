/**
 * @myDocBlock v2.3
 * @file PUT.test.ts
 * @internal
 * @module tests/routes/v1/auth/register
 * @tag auth, register, test
 * @version 1.1.0
 * @path tests/routes/v1/auth/register/PUT.test.ts
 * @summary Tests PUT /v1/auth/register endpoint glue logic.
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

vi.mock('@services/auth/passwordService', () => ({
    hashPassword: vi.fn(),
    enforcePasswordHistory: vi.fn(),
}))

vi.mock('@services/auth/emailVerificationService', () => ({
    issueEmailVerificationToken: vi.fn(),
}))

vi.mock('@services/dbService', () => ({
    db: {
        transaction: vi.fn(),
    },
}))

vi.mock('@db/schema', () => ({
    users: { id: 'id' },
    userAuthLocal: {},
    userApplications: {},
}))

/**
 * ------------------------------------------------------------
 * IMPORTS (AFTER MOCKS)
 * ------------------------------------------------------------
 */

import PUT from '@routes/v1/auth/register/PUT'
import { resolveAuthContext } from '@services/auth/authContext'
import { hashPassword } from '@services/auth/passwordService'
import { issueEmailVerificationToken } from '@services/auth/emailVerificationService'
import { db } from '@services/dbService'

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
        setHeader() {},
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

describe('PUT /v1/auth/register', () => {
    test('creates a user, issues email verification token, and returns 201', async () => {
        ;(resolveAuthContext as any).mockResolvedValue({
            applicationId: 'app-id',
        })

        ;(hashPassword as any).mockResolvedValue('hashed-password')

        ;(issueEmailVerificationToken as any).mockResolvedValue({
            token: 'raw-email-token',
        })

        ;(db.transaction as any).mockImplementation(
            async (fn: any) =>
                fn({
                    insert: () => ({
                        values: () => ({}),
                    }),
                })
        )

        const req = createReq({
            app_key: 'bill.iworkhere.com',
            username: 'bill',
            email: 'bill@example.com',
            password: 'secret',
        })

        const res = createRes()

        await PUT(req, res)

        expect(res.statusCode).toBe(201)

        expect(res.body).toEqual({
            user: {
                id: expect.any(String),
                username: 'bill',
                email: 'bill@example.com',
                status: 'pending',
            },
        })

        expect(issueEmailVerificationToken).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: expect.any(String),
                email: 'bill@example.com',
                tx: expect.any(Object),
            })
        )
    })

    test('returns 400 when required fields are missing', async () => {
        const req = createReq({
            app_key: 'bill.iworkhere.com',
        })

        const res = createRes()

        await PUT(req, res)

        expect(res.statusCode).toBe(400)
        expect(res.body).toEqual({
            error: 'INVALID_REQUEST',
            message: 'username, email, and password are required',
        })
    })
})
