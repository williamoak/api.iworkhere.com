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

    describe("configGetNumber", () => {
        it("returns parsed number when variable is present and valid", async () => {
            process.env.PORT = "3000";
            const { configGetNumber } = await import("@helpers/config");

            expect(configGetNumber("PORT")).toBe(3000);
        });

        it("returns defaultValue when variable is missing or empty", async () => {
            process.env.EMPTY_NUM = "  ";
            const { configGetNumber } = await import("@helpers/config");

            expect(configGetNumber("MISSING_NUM", { defaultValue: 8080 })).toBe(8080);
            expect(configGetNumber("EMPTY_NUM", { defaultValue: 9000 })).toBe(9000);
        });

        it("throws if missing and no defaultValue provided", async () => {
            const { configGetNumber } = await import("@helpers/config");

            expect(() => configGetNumber("NON_EXISTENT"))
                .toThrow("Missing required numeric configuration variable: NON_EXISTENT");
        });

        it("throws if value is not a finite number", async () => {
            process.env.INVALID_NUM = "not_a_number";
            const { configGetNumber } = await import("@helpers/config");

            expect(() => configGetNumber("INVALID_NUM"))
                .toThrow("Invalid numeric value for configuration variable: INVALID_NUM");
        });

        it("validates min constraint", async () => {
            process.env.LOW_NUM = "5";
            const { configGetNumber } = await import("@helpers/config");

            expect(() => configGetNumber("LOW_NUM", { min: 10 }))
                .toThrow("Configuration variable LOW_NUM must be >= 10");

            expect(configGetNumber("LOW_NUM", { min: 5 })).toBe(5);
        });

        it("validates max constraint", async () => {
            process.env.HIGH_NUM = "150";
            const { configGetNumber } = await import("@helpers/config");

            expect(() => configGetNumber("HIGH_NUM", { max: 100 }))
                .toThrow("Configuration variable HIGH_NUM must be <= 100");

            expect(configGetNumber("HIGH_NUM", { max: 150 })).toBe(150);
        });
    });

    describe("getGoogleOAuthConfig", () => {
        it("returns complete Google OAuth configuration object", async () => {
            process.env.GOOGLE_OAUTH_CLIENT_ID = "client-id";
            process.env.GOOGLE_OAUTH_CLIENT_SECRET = "client-secret";
            process.env.GOOGLE_OAUTH_REDIRECT_URI = "https://app.com/callback";
            process.env.GOOGLE_AUTHORIZATION_URL = "https://accounts.google.com/o/oauth2/v2/auth";
            process.env.GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
            process.env.GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
            process.env.OAUTH_STATE_SECRET = "state-secret";
            process.env.GOOGLE_OAUTH_SUCCESS_REDIRECT_URL = "https://app.com/success";
            process.env.GOOGLE_OAUTH_FAILURE_REDIRECT_URL = "https://app.com/failure";

            const { getGoogleOAuthConfig } = await import("@helpers/config");

            const oauthConfig = getGoogleOAuthConfig();
            expect(oauthConfig).toEqual({
                clientId: "client-id",
                clientSecret: "client-secret",
                redirectUri: "https://app.com/callback",
                authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
                tokenUrl: "https://oauth2.googleapis.com/token",
                userInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
                stateSecret: "state-secret",
                successRedirectUrl: "https://app.com/success",
                failureRedirectUrl: "https://app.com/failure",
            });
        });
    });
});
