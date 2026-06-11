/**
 * @myDocBlock v2.3
 * @file PUT.test.ts
 * @internal
 * @module tests/routes/v1/auth/register
 * @tag auth, register, test
 * @version 1.2.0
 * @author william.r.oak@gmail.com
 * @path tests/routes/v1/auth/register/PUT.test.ts
 * @summary Unit tests for PUT /v1/auth/register endpoint glue logic.
 * @description
 * Verifies that the register endpoint:
 *   - orchestrates auth context resolution and password hashing
 *   - executes user creation and email verification issuance within a DB transaction
 *   - returns HTTP 201 with a pending user payload on success
 *   - consumes middleware-validated request payload when present
 *
 * Also verifies that the endpoint exports a Zod `schema` definition for request
 * validation (consumed by the route loader middleware chain).
 *
 * @query
 *   {}
 *
 * @requires
 * {
 *   "services": [
 *     "authContext",
 *     "passwordService",
 *     "emailVerificationService",
 *     "dbService"
 *   ],
 *   "tables": [
 *     "users",
 *     "user_auth_local",
 *     "user_applications"
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

vi.mock('@services/auth/passwordService', () => ({
    hashPassword: vi.fn(),
    enforcePasswordHistory: vi.fn(),
}))

vi.mock('@services/auth/emailVerificationService', () => ({
    issueEmailVerificationToken: vi.fn(),
    sendVerificationEmail: vi.fn(),
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

import PUT, { schema } from '@routes/v1/auth/register/PUT'
import { resolveAuthContext } from '@services/auth/authContext'
import { hashPassword } from '@services/auth/passwordService'
import { issueEmailVerificationToken } from '@services/auth/emailVerificationService'
import { db } from '@services/dbService'

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

describe('PUT /v1/auth/register', () => {
    test('exports a Zod request schema', async () => {
        expect(schema).toBeTruthy()
        expect(schema.body).toBeTruthy()

        const parsed = schema.body.safeParse({
            app_key: 'bill.iworkhere.com',
            username: 'bill',
            email: 'not-an-email',
            password: 'goodpassword',
        })

        expect(parsed.success).toBe(false)
    })

    test('creates a user, issues email verification token, and returns 201', async () => {
      (resolveAuthContext as any).mockResolvedValue({
        applicationId: 'app-id',
      });
      (hashPassword as any).mockResolvedValue('hashed-password');
      (issueEmailVerificationToken as any).mockResolvedValue({
        token: 'raw-email-token',
      });
      (db.transaction as any).mockImplementation(async (fn: any) =>
        fn({
          insert: () => ({
            values: () => ({}),
          }),
        }),
      );

      const req = createReq({
        app_key: 'bill.iworkhere.com',
        username: 'bill',
        email: 'bill@example.com',
        password: 'goodpassword',
      });

      const res = createRes();

      await PUT(req, res);

      expect(res.statusCode).toBe(201);

      expect(res.body).toEqual({
        user: {
          id: expect.any(String),
          username: 'bill',
          email: 'bill@example.com',
          status: 'pending',
        },
      });

      expect(issueEmailVerificationToken).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: expect.any(String),
          applicationId: 'app-id',
          email: 'bill@example.com',
          tx: expect.any(Object),
        }),
      );
    })

    test('prefers middleware-validated body payload when present', async () => {
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

        const req = createReq({})
        ;(req as any).validated = {
            body: {
                app_key: 'bill.iworkhere.com',
                username: 'bill',
                email: 'bill@example.com',
                password: 'goodpassword',
            },
        }

        const res = createRes()

        await PUT(req, res)

// ... existing code ...
      expect(res.statusCode).toBe(201)
      expect(resolveAuthContext).toHaveBeenCalledWith(
        expect.objectContaining({
          app_key: 'bill.iworkhere.com',
          username: 'bill',
          email: 'bill@example.com',
        })
      )
    })

  test('returns 409 EMAIL_TAKEN when database throws email unique constraint violation', async () => {
    ;(resolveAuthContext as any).mockResolvedValue({
      applicationId: 'app-id',
    })
    ;(hashPassword as any).mockResolvedValue('hashed-password')

    // Simulate DB throwing a unique constraint violation for email
    const dbError = new Error('duplicate key value violates unique constraint "users_email_unique"');
    (dbError as any).code = '23505';
    (dbError as any).constraint = 'users_email_unique';

    ;(db.transaction as any).mockRejectedValueOnce(dbError)

    const req = createReq({
      app_key: 'bill.iworkhere.com',
      username: 'bill',
      email: 'taken@example.com',
      password: 'goodpassword',
    })

    const res = createRes()

    await PUT(req, res)

    expect(res.statusCode).toBe(409)
    expect(res.body).toEqual({
      error: 'EMAIL_TAKEN',
      message: 'An account with this email already exists',
    })
  })

  test('returns 409 USERNAME_TAKEN when database throws username unique constraint violation', async () => {
    ;(resolveAuthContext as any).mockResolvedValue({
      applicationId: 'app-id',
    })
    ;(hashPassword as any).mockResolvedValue('hashed-password')

    // Simulate DB throwing a unique constraint violation for username
    const dbError = new Error('duplicate key value violates unique constraint "users_username_unique"');
    (dbError as any).code = '23505';
    (dbError as any).constraint = 'users_username_unique';

    ;(db.transaction as any).mockRejectedValueOnce(dbError)

    const req = createReq({
      app_key: 'bill.iworkhere.com',
      username: 'taken-username',
      email: 'bill@example.com',
      password: 'goodpassword',
    })

    const res = createRes()

    await PUT(req, res)

    expect(res.statusCode).toBe(409)
    expect(res.body).toEqual({
      error: 'USERNAME_TAKEN',
      message: 'This username is already taken',
    })
  })
})
