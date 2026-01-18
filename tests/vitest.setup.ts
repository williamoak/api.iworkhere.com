import { vi } from "vitest";

process.env.API_VERSION = "v1";
process.env.MAX_CONCURRENT_REQUESTS = "10";

/**
 * HARD FAIL if anything tries to access the real database service.
 */
vi.mock("@services/dbService", () => {
    return {
        __esModule: true,
        default: () => {
            throw new Error(
                "❌ dbService was called during a unit test. " +
                "Mock it explicitly or move this test to integration."
            );
        },
    };
});

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
