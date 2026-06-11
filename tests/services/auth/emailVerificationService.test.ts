/**
 * @myDocBlock v3.1
 * @file emailVerificationService.test.ts
 * @internal
 * @module tests/services/auth/emailVerificationService
 * @tag auth, email, verification, test
 * @version 1.1.0
 * @path tests/services/auth/emailVerificationService.test.ts
 * @summary Tests email verification service logic.
 */

import { describe, test, expect, vi, beforeEach, beforeAll } from 'vitest'

/**
 * ------------------------------------------------------------
 * MOCKS — MUST APPEAR BEFORE IMPORTS
 * ------------------------------------------------------------
 */

vi.mock('@services/dbService', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  },
}))

vi.mock('@db/schema', () => ({
  users: {
    id: 'users.id',
    email: 'users.email',
    statusCode: 'users.status_code',
    emailVerifiedAt: 'users.email_verified_at',
  },
  userApplications: {
    userId: 'ua.user_id',
    applicationId: 'ua.application_id',
    isEnabled: 'ua.is_enabled',
  },
  emailVerificationTokens: {
    id: 'evt.id',
    userId: 'evt.user_id',
    tokenHash: 'evt.token_hash',
    expiresAt: 'evt.expires_at',
  },
}))

vi.mock('@helpers/config', () => ({
  configGet: vi.fn((key: string) => {
    if (key === 'EMAIL_VERIFY_TOKEN_TTL_SECONDS') return '3600';
    if (key === 'APP_URL') return 'http://localhost:3000';
    return undefined;
  }),
}))

vi.mock('@helpers/mailer', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}))

/**
 * ------------------------------------------------------------
 * IMPORTS (AFTER MOCKS)
 * ------------------------------------------------------------
 */

import { db } from '@services/dbService'
// We'll import the real implementation at runtime because the module is
// globally mocked in tests/vitest.setup.ts. Use vi.importActual to obtain
// the real functions so we can test them here.
let verifyEmailToken: typeof import('@services/auth/emailVerificationService').verifyEmailToken;
let issueEmailVerificationToken: typeof import('@services/auth/emailVerificationService').issueEmailVerificationToken;
let resendEmailVerificationToken: typeof import('@services/auth/emailVerificationService').resendEmailVerificationToken;

beforeAll(async () => {
  const actual = await vi.importActual<typeof import('@services/auth/emailVerificationService')>('@services/auth/emailVerificationService');
  verifyEmailToken = actual.verifyEmailToken;
  issueEmailVerificationToken = actual.issueEmailVerificationToken;
  resendEmailVerificationToken = actual.resendEmailVerificationToken;
});

/**
 * ------------------------------------------------------------
 * HELPERS
 * ------------------------------------------------------------
 */

function mockSelectOnce(rows: any[]) {
  ;(db.select as any).mockReturnValueOnce({
    from: () => ({
      innerJoin: () => ({
        where: () => ({
          limit: () => Promise.resolve(rows),
        }),
      }),
    }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

/**
 * ------------------------------------------------------------
 * TESTS
 * ------------------------------------------------------------
 */

describe('verifyEmailToken', () => {
  test('throws if token is missing', async () => {
    await expect(
      verifyEmailToken(undefined as any)
    ).rejects.toMatchObject({
      code: 'INVALID_TOKEN',
      httpStatus: 400,
    })
  })

  test('throws if token is invalid', async () => {
    mockSelectOnce([])

    await expect(
      verifyEmailToken('bad-token')
    ).rejects.toMatchObject({
      code: 'INVALID_TOKEN',
      httpStatus: 401,
    })
  })

  test('throws if token is expired', async () => {
    mockSelectOnce([
      {
        userId: 'user-id',
        email: 'user@example.com',
        tokenId: 'token-id',
        expiresAt: new Date(Date.now() - 1000),
      },
    ])

    await expect(
      verifyEmailToken('expired-token')
    ).rejects.toMatchObject({
      code: 'TOKEN_EXPIRED',
      httpStatus: 401,
    })
  })

  test('activates user and deletes token on success', async () => {
    mockSelectOnce([
      {
        userId: 'user-id',
        email: 'user@example.com',
        tokenId: 'token-id',
        expiresAt: new Date(Date.now() + 10000),
      },
    ])

    ;(db.transaction as any).mockImplementation(
      async (fn: any) => {
        await fn({
          update: () => ({
            set: () => ({
              where: () => Promise.resolve(),
            }),
          }),
          delete: () => ({
            where: () => Promise.resolve(),
          }),
        })
      }
    )

    const result = await verifyEmailToken('valid-token')

    expect(result).toEqual({
      id: 'user-id',
      email: 'user@example.com',
    })

    expect(db.transaction).toHaveBeenCalledOnce()
  })
})

describe('issueEmailVerificationToken', () => {
  test('inserts token and returns raw value', async () => {
    ;(db.insert as any).mockReturnValue({
      values: () => Promise.resolve(),
    })

    const result = await issueEmailVerificationToken({
      userId: 'user-id',
      applicationId: 'app-id',
      email: 'bill@example.com',
    })

    expect(result.token).toBeTypeOf('string')
    expect(result.token.length).toBeGreaterThan(20)
    expect(db.insert).toHaveBeenCalledOnce()
  })

  test('throws if database insertion fails', async () => {
    ;(db.insert as any).mockReturnValue({
        values: () => Promise.reject(new Error('DB_ERROR')),
    })

    await expect(
      issueEmailVerificationToken({
        userId: 'user-id',
        applicationId: 'app-id',
        email: 'bill@example.com',
      })
    ).rejects.toThrow('DB_ERROR')
  })

  test('throws if inputs are missing', async () => {
    await expect(
      issueEmailVerificationToken({} as any)
    ).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
      httpStatus: 400,
    })
  })
})

describe('resendEmailVerificationToken', () => {
  test('does nothing if user not found', async () => {
    mockSelectOnce([])

    await resendEmailVerificationToken({
      applicationId: 'app-id',
      email: 'missing@example.com',
    })

    expect(db.transaction).not.toHaveBeenCalled()
  })

  test('does nothing if user is not pending', async () => {
    mockSelectOnce([
      {
        userId: 'user-id',
        status: 'active',
      },
    ])

    await resendEmailVerificationToken({
      applicationId: 'app-id',
      email: 'user@example.com',
    })

    expect(db.transaction).not.toHaveBeenCalled()
  })

  test('invalidates old tokens and issues new one for pending user', async () => {
    mockSelectOnce([
      {
        userId: 'user-id',
        status: 'pending',
      },
    ])

    ;(db.transaction as any).mockImplementation(
      async (fn: any) => {
        await fn({
          delete: () => ({
            where: () => Promise.resolve(),
          }),
          insert: () => ({
            values: () => Promise.resolve(),
          }),
        })
      }
    )

    await resendEmailVerificationToken({
      applicationId: 'app-id',
      email: 'user@example.com',
    })

    expect(db.transaction).toHaveBeenCalledOnce()

    // Verify that sendEmail was called
    const { sendEmail } = await import('@helpers/mailer');
    expect(sendEmail).toHaveBeenCalled();
  })
})
