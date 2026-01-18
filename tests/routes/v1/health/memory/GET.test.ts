import { describe, it, expect, vi } from "vitest";
import type { HealthResponse } from "@models/health";
import handler from "@routes/v1/health/memory/GET";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function mockReq() {
    return {} as any;
}

function mockInternalRes() {
    // No json() → internal invocation
    return {} as any;
}

function mockExternalRes() {
    return {
        json: vi.fn()
    } as any;
}

/* -------------------------------------------------------------------------- */
/* handler — internal invocation                                               */
/* -------------------------------------------------------------------------- */

describe("health/memory handler — internal mode", () => {
    it("returns HealthResponse directly", async () => {
        const req = mockReq();
        const res = mockInternalRes();

        const result = await handler(req, res);

        // Narrow union safely
        if (!result || typeof result !== "object" || !("data" in result)) {
            throw new Error("Expected HealthResponse in internal mode");
        }

        const health = result as HealthResponse;

        expect(health.status).toBe("ok");
        expect(health.name).toBe("memory");

        // Process memory
        expect(health.data.process).toHaveProperty("rss");
        expect(health.data.process).toHaveProperty("heapTotal");
        expect(health.data.process).toHaveProperty("heapUsed");
        expect(health.data.process).toHaveProperty("external");
        expect(health.data.process).toHaveProperty("arrayBuffers");

        // System memory
        expect(health.data.system).toHaveProperty("total");
        expect(health.data.system).toHaveProperty("free");
        expect(health.data.system).toHaveProperty("used");

        expect(typeof health.data.system.used).toBe("number");
    });
});

/* -------------------------------------------------------------------------- */
/* handler — external invocation                                               */
/* -------------------------------------------------------------------------- */

describe("health/memory handler — external mode", () => {
    it("writes JSON response via res.json()", async () => {
        const req = mockReq();
        const res = mockExternalRes();

        // Act — do NOT capture return value
        await handler(req, res);

        expect(res.json).toHaveBeenCalledTimes(1);

        const payload = res.json.mock.calls[0][0];

        expect(payload).toMatchObject({
            status: "ok",
            name: "memory"
        });

        expect(payload.data).toHaveProperty("process");
        expect(payload.data).toHaveProperty("system");
    });
});
