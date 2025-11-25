import { describe, it, expect, beforeEach, vi } from "vitest";

// IMPORTANT:
// We must re-import the module after modifying process.env.
// Vitest caches modules, so we use vi.resetModules() before each test.

describe("config.ts", () => {
    beforeEach(() => {
        // reset the entire environment
        process.env = {};

        // clear Vitest's module cache
        vi.resetModules();
    });

    it("merges process.env values into config", async () => {
        process.env.TEST_KEY = "hello";

        const { config } = await import("@helpers/config");

        expect(config.TEST_KEY).toBe("hello");
    });

    it("configGet returns a required value", async () => {
        process.env.API_PORT = "4300";

        const { configGet } = await import("@helpers/config");

        expect(configGet("API_PORT")).toBe("4300");
    });

    it("configGet throws for missing variables", async () => {
        const { configGet } = await import("@helpers/config");

        expect(() => configGet("MISSING_VAR")).toThrowError(
            "Missing required configuration variable: MISSING_VAR"
        );
    });
});
