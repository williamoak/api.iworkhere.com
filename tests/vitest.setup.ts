import { vi } from 'vitest';

process.env.API_VERSION = 'v1';
process.env.MAX_CONCURRENT_REQUESTS = '10';

/**
 * Mock crypto to avoid real hashing and UUID generation
 */
vi.mock('crypto', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('crypto');
  return {
    ...actual,
    createHash: vi.fn(() => ({
      update: vi.fn().mockReturnThis(),
      digest: vi.fn().mockReturnValue('mocked-hash'),
    })),
    randomUUID: vi.fn().mockReturnValue('mocked-uuid'),
  };
});

/**
 * Mock schema - includes all commonly used tables
 */
vi.mock('@db/schema', () => ({
  authTokens: {
    userId: 'userId',
    tokenHash: 'tokenHash',
    tokenType: 'tokenType',
    revokedAt: 'revokedAt',
    expiresAt: 'expiresAt',
  },
  applications: {
    id: 'id',
    appKey: 'app_key',
    isEnabled: 'is_enabled',
  },
  users: {
    id: 'id',
    username: 'username',
    email: 'email',
    isEnabled: 'is_enabled',
  },
  emailVerificationTokens: {
    id: 'id',
    userId: 'userId',
    token: 'token',
    expiresAt: 'expiresAt',
  },
  emailAuditLogs: {
    id: 'id',
    userId: 'userId',
    email: 'email',
    emailType: 'emailType',
    status: 'status',
    errorMessage: 'errorMessage',
    createdAt: 'createdAt',
  },
  passwordResetTokens: {
    id: 'id',
    userId: 'userId',
    token: 'token',
    expiresAt: 'expiresAt',
  },
}));

/**
 * Mock drizzle-orm functions
 */
vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  or: vi.fn(),
  eq: vi.fn(),
  gt: vi.fn(),
  lt: vi.fn(),
  isNull: vi.fn(),
  inArray: vi.fn(),
}));

/**
 * Default filesystem mock:
 * - allow reads
 * - forbid writes
 */
vi.mock('fs', async () => {
  const realFs = await vi.importActual<typeof import('fs')>('fs');

  return {
    ...realFs,
    writeFileSync: () => {
      throw new Error('fs.writeFileSync was called during a unit test.');
    },
  };
});

vi.mock('node:fs', async () => {
  const realFs = await vi.importActual<typeof import('fs')>('fs');

  return {
    ...realFs,
    writeFileSync: () => {
      throw new Error('fs.writeFileSync was called during a unit test.');
    },
  };
});

/**
 * dotenv: use the real implementation so the test environment loader
 * can pick up .env, .env.local, .env.<NODE_ENV>, etc. Tests that need to
 * override env values should set process.env in the setup or per-test.
 */
vi.mock('dotenv', async (importOriginal) => {
  const actual = await importOriginal();
  // Return the real module so calling dotenv.config() reads files as usual
  return actual;
});

/**
 * HARD FAIL if anything tries to access the real database service.
 * Individual tests can override db.select() as needed.
 *
 * Default behavior: db.select() returns empty array []
 * Tests should mock it explicitly with mockReturnValue()
 */
vi.mock('@services/dbService', () => {
  return {
    __esModule: true,
    db: {
      insert: vi.fn(),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            then: (resolve: any) => resolve([]),
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    },
    pool: new Proxy(
      {},
      {
        get: () => {
          throw new Error(
            '❌ pool was accessed during a unit test. ' +
              'Mock it explicitly or move this test to integration.',
          );
        },
      },
    ),
    query: () => {
      throw new Error(
        '❌ query was called during a unit test. ' +
          'Mock it explicitly or move this test to integration.',
      );
    },
    verifyConnection: () => {
      throw new Error(
        '❌ verifyConnection was called during a unit test. ' +
          'Mock it explicitly or move this test to integration.',
      );
    },
  };
});

// --- Global mocks for route-level service dependencies ---
vi.mock('@services/users/getUserById', () => ({
  __esModule: true,
  getUserById: vi.fn(),
}));

vi.mock('@services/auth/authContext', () => ({
  __esModule: true,
  resolveAuthContext: vi.fn(),
  AuthError: class AuthError extends Error {
    httpStatus: number;
    code: string;
    constructor(code: string, message: string, httpStatus = 400) {
      super(message);
      this.name = 'AuthError';
      this.code = code;
      this.httpStatus = httpStatus;
    }
  },
}));

vi.mock('@services/auth/emailVerificationService', () => ({
  __esModule: true,
  resendEmailVerificationToken: vi.fn(),
  verifyEmailToken: vi.fn(),
  issueEmailVerificationToken: vi.fn(),
}));

// NOTE: authUserResolver, passwordService, and tokenService are intentionally
// NOT mocked globally here. Their modules contain their own unit tests which
// need the real implementations. Route-level tests that require mocking these
// services should declare per-test-file mocks before importing the modules
// (see tests that include the "MOCKS — MUST APPEAR BEFORE IMPORTS" pattern).

