import { describe, it, expect, vi } from "vitest";
import handler, { __test__ } from "@routes/v1/health/api/GET";

const { isInternalInvocation } = __test__;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function mockReq() {
    return {} as any;
}

function mockInternalRes() {
    // no json() → internal mode
    return {} as any;
}

function mockExternalRes() {
    return {
        json: vi.fn()
    } as any;
}

/* -------------------------------------------------------------------------- */
/* isInternalInvocation                                                        */
/* -------------------------------------------------------------------------- */

describe("isInternalInvocation", () => {
    it("returns true when res.json is missing", () => {
        const res = mockInternalRes();
        expect(isInternalInvocation(res)).toBe(true);
    });

    it("returns false when res.json exists", () => {
        const res = mockExternalRes();
        expect(isInternalInvocation(res)).toBe(false);
    });
});

/* -------------------------------------------------------------------------- */
/* handler — internal invocation                                               */
/* -------------------------------------------------------------------------- */

describe("health/api handler (internal mode)", () => {
    it("returns HealthResponse directly", async () => {
        const req = mockReq();
        const res = mockInternalRes();

        const result = await handler(req, res);

        expect(result).toBeDefined();

        if (!result || typeof result !== "object" || !("data" in result)) {
            throw new Error("Expected internal invocation to return HealthResponse");
        }

        expect(result.status).toBe("ok");
        expect(result.name).toBe("api");
        expect(result.data).toHaveProperty("uptime");
        const data = result.data as any;
        expect(typeof data.uptime).toBe("number");

    });
});
