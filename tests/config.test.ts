import { describe, it, expect, beforeEach, jest } from "@jest/globals";

describe("helpers/config", () => {
    beforeEach(() => {
        process.env = {};
    });

    it("returns a required config value from process.env", async () => {
        process.env.API_KEY = "abc123";

        const { configGet } = await import("@helpers/config.js");

        expect(configGet("API_KEY")).toBe("abc123");
    });

    it("throws if the config value is missing", async () => {
        const { configGet } = await import("@helpers/config.js");

        expect(() => configGet("MISSING_KEY"))
            .toThrow("Missing required configuration variable: MISSING_KEY");
    });

    it("throws if the config value is an empty string", async () => {
        process.env.EMPTY_VALUE = "   ";

        const { configGet } = await import("@helpers/config.js");

        expect(() => configGet("EMPTY_VALUE"))
            .toThrow("Missing required configuration variable: EMPTY_VALUE");
    });

    it("prefers process.env over env file values", async () => {
        process.env.OVERRIDE_ME = "runtime";

        // This test needs a fresh import
        jest.resetModules();

        const { configGet } = await import("@helpers/config.js");

        expect(configGet("OVERRIDE_ME")).toBe("runtime");
    });
});
