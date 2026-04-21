import { vi } from "vitest";

process.env.API_VERSION = "v1";
process.env.MAX_CONCURRENT_REQUESTS = "10";
vi.spyOn(console, 'log').mockImplementation(() => {});

/**
 * Mock crypto to avoid real hashing and UUID generation
 */
vi.mock('crypto', async (importOriginal) => {
  const actual = await importOriginal() as typeof import('crypto');
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
 * Mock schema
 */
vi.mock('@db/schema', () => ({
  authTokens: {
    userId: 'userId',
    tokenHash: 'tokenHash',
    tokenType: 'tokenType',
    revokedAt: 'revokedAt',
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
  isNull: vi.fn(),
  inArray: vi.fn(),
}));

/**
 * Default filesystem mock:
 * - allow reads
 * - forbid writes
 */
vi.mock("fs", async () => {
    const realFs = await vi.importActual<typeof import("fs")>("fs");

    return {
        ...realFs,
        writeFileSync: () => {
            throw new Error("fs.writeFileSync was called during a unit test.");
        },
    };
});

vi.mock("node:fs", async () => {
    const realFs = await vi.importActual<typeof import("fs")>("fs");

    return {
        ...realFs,
        writeFileSync: () => {
            throw new Error("fs.writeFileSync was called during a unit test.");
        },
    };
});

/**
 * Default dotenv mock
 */
vi.mock("dotenv", () => ({
    default: {
        config: () => ({ parsed: {} }),
    },
}));

/**
 * HARD FAIL if anything tries to access the real database service.
 * Individual tests can override db.select() as needed.
 */
vi.mock("@services/dbService", () => {
    return {
        __esModule: true,
        db: {
            select: vi.fn(() => {
                throw new Error(
                    "❌ db.select was accessed during a unit test without explicit mock. " +
                    "Mock it in your test or move this test to integration."
                );
            }),
        },
        pool: new Proxy({}, {
            get: () => {
                throw new Error(
                    "❌ pool was accessed during a unit test. " +
                    "Mock it explicitly or move this test to integration."
                );
            },
        }),
        query: () => {
            throw new Error(
                "❌ query was called during a unit test. " +
                "Mock it explicitly or move this test to integration."
            );
        },
        verifyConnection: () => {
            throw new Error(
                "❌ verifyConnection was called during a unit test. " +
                "Mock it explicitly or move this test to integration."
            );
        },
    };
});
