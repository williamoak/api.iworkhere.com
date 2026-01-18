import { jest } from "@jest/globals";

/**
 * HARD FAIL if anything tries to access the real database service.
 * Unit tests must mock this explicitly.
 */
jest.unstable_mockModule("@services/dbService", () => {
    throw new Error(
        "❌ dbService was imported during a unit test. " +
        "Mock it explicitly or move this test to integration."
    );
});

/**
 * Default filesystem mock for unit tests.
 */
jest.unstable_mockModule("fs", () => ({
    default: {
        existsSync: () => false,

        readFileSync: () => {
            throw new Error(
                "fs.readFileSync was called during a unit test. " +
                "Mock it explicitly if required."
            );
        },

        writeFileSync: () => {
            throw new Error(
                "fs.writeFileSync was called during a unit test. " +
                "Mock it explicitly if required."
            );
        }
    }
}));

/**
 * Default dotenv mock:
 * - Prevents reading real .env files
 * - Always provides a default export
 */
jest.unstable_mockModule("dotenv", () => ({
    default: {
        config: () => ({ parsed: {} })
    }
}));
