import { describe, it, expect } from "@jest/globals";

describe("unit test guardrails", () => {
    it("blocks infrastructure access", async () => {
        await expect(async () => {
            await import("@services/dbService");
        }).rejects.toThrow(/❌/);
    });
});
