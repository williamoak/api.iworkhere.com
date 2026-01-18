import { describe, it, expect, beforeEach, vi } from "vitest";

describe("helpers/config", () => {
    beforeEach(() => {
        process.env = {};
        vi.resetModules();
    });

    it("returns a required config value from process.env", async () => {
        process.env.API_KEY = "abc123";

        const { configGet } = await import("@helpers/config");

        expect(configGet("API_KEY")).toBe("abc123");
    });

    it("throws if the config value is missing", async () => {
        const { configGet } = await import("@helpers/config");

        expect(() => configGet("MISSING_KEY"))
            .toThrow("Missing required configuration variable: MISSING_KEY");
    });

    it("throws if the config value is an empty string", async () => {
        process.env.EMPTY_VALUE = "   ";

        const { configGet } = await import("@helpers/config");

        expect(() => configGet("EMPTY_VALUE"))
            .toThrow("Missing required configuration variable: EMPTY_VALUE");
    });

    it("prefers process.env over env file values", async () => {
        process.env.OVERRIDE_ME = "runtime";

        vi.resetModules();

        const { configGet } = await import("@helpers/config");

        expect(configGet("OVERRIDE_ME")).toBe("runtime");
    });
});
