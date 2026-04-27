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
        const data = health.data as any;

        expect(health.status).toBe("ok");
        expect(health.name).toBe("memory");

        // Process memory
        expect(data.process).toHaveProperty("rss");
        expect(data.process).toHaveProperty("heapTotal");
        expect(data.process).toHaveProperty("heapUsed");
        expect(data.process).toHaveProperty("external");
        expect(data.process).toHaveProperty("arrayBuffers");

        // System memory
        expect(data.system).toHaveProperty("total");
        expect(data.system).toHaveProperty("free");
        expect(data.system).toHaveProperty("used");

        expect(typeof data.system.used).toBe("number");
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

        const payloadData = payload.data as any;
        expect(payloadData).toHaveProperty("process");
        expect(payloadData).toHaveProperty("system");
    });
});
