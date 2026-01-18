import { describe, it, expect, vi, beforeEach } from "vitest";
import type { HealthResponse } from "@models/health";

// ---------------------------------------------------------------------------
// MOCK: database service
// ---------------------------------------------------------------------------

vi.mock("@services/dbService", () => ({
    query: vi.fn()
}));

import handler, { __test__ } from "@routes/v1/health/database/GET";
import { query } from "@services/dbService";

const {
    normalizeNodeBuildInfo,
    extractVersion
} = __test__;

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
        json: vi.fn(),
        status: vi.fn().mockReturnThis()
    } as any;
}

beforeEach(() => {
    vi.clearAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Sanity check                                                               */
/* -------------------------------------------------------------------------- */

describe("health/database handler — setup", () => {
    it("loads with mocked dbService", () => {
        expect(query).toBeDefined();
        expect(typeof query).toBe("function");
    });
});

/* -------------------------------------------------------------------------- */
/* handler — internal invocation (success)                                     */
/* -------------------------------------------------------------------------- */

describe("health/database handler — internal mode (success)", () => {
    it("returns HealthResponse on successful database checks", async () => {
        // Arrange
        (query as any)
            .mockResolvedValueOnce({ rows: [] }) // SELECT now()
            .mockResolvedValueOnce({
                rows: [{ field: "tag", value: "v24.1.3" }]
            });

        const req = mockReq();
        const res = mockInternalRes();

        // Act
        const result = await handler(req, res);

        // Narrow union → HealthResponse
        if (!result || typeof result !== "object" || !("data" in result)) {
            throw new Error("Expected HealthResponse in internal mode");
        }

        const health = result as HealthResponse;

        // Assert
        expect(health.status).toBe("ok");
        expect(health.name).toBe("database");
        expect(typeof health.data.latencyMs).toBe("number");
        expect(health.data.version).toBe("v24.1.3");
        expect(health.data.nodeCount).toBe(1);
        expect(health.data.mTLSActive).toBe(true);
    });
});

/* -------------------------------------------------------------------------- */
/* handler — external invocation (error)                                       */
/* -------------------------------------------------------------------------- */

describe("health/database handler — external mode (error)", () => {
    it("writes 500 and failure payload when query throws", async () => {
        // Arrange
        (query as any).mockRejectedValueOnce(
            new Error("DB down")
        );

        const req = mockReq();
        const res = mockExternalRes();

        // Act (DO NOT capture return value)
        await handler(req, res);

        // Assert side effects
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledTimes(1);

        const payload = res.json.mock.calls[0][0];

        expect(payload).toEqual({
            status: "fail",
            name: "database",
            data: {
                error: "DB down"
            }
        });
    });
});

/* -------------------------------------------------------------------------- */
/* handler — internal invocation (error)                                       */
/* -------------------------------------------------------------------------- */

describe("health/database handler — internal mode (error)", () => {
    it("returns failure HealthResponse directly", async () => {
        // Arrange
        (query as any).mockRejectedValueOnce(
            new Error("Connection refused")
        );

        const req = mockReq();
        const res = mockInternalRes();

        // Act
        const result = await handler(req, res);

        // Narrow union
        if (!result || typeof result !== "object" || !("data" in result)) {
            throw new Error("Expected HealthResponse in internal mode");
        }

        const health = result as HealthResponse;

        // Assert
        expect(health).toEqual({
            status: "fail",
            name: "database",
            data: {
                error: "Connection refused"
            }
        });
    });
});

/* -------------------------------------------------------------------------- */
/* normalizeNodeBuildInfo                                                      */
/* -------------------------------------------------------------------------- */

describe("normalizeNodeBuildInfo", () => {
    it("converts key/value rows into an object", () => {
        const rows = [
            { field: "tag", value: "v24.1.3" },
            { field: "version", value: 24 },
        ];

        const result = normalizeNodeBuildInfo(rows);

        expect(result).toEqual({
            tag: "v24.1.3",
            version: "24"
        });
    });

    it("ignores rows missing field or value", () => {
        const rows = [
            { field: "tag", value: "v24.1.3" },
            { field: null, value: "bad" },
            { field: "x" }
        ];

        const result = normalizeNodeBuildInfo(rows);

        expect(result).toEqual({
            tag: "v24.1.3"
        });
    });

    it("handles null or empty input", () => {
        expect(normalizeNodeBuildInfo(null as any)).toEqual({});
        expect(normalizeNodeBuildInfo([])).toEqual({});
    });
});

/* -------------------------------------------------------------------------- */
/* extractVersion                                                              */
/* -------------------------------------------------------------------------- */

describe("extractVersion", () => {
    it("prefers tag field", () => {
        expect(extractVersion({ tag: "v1.2.3" })).toBe("v1.2.3");
    });

    it("falls back to version field", () => {
        expect(extractVersion({ version: "v2.0.0" })).toBe("v2.0.0");
    });

    it("falls back to Version (capitalized)", () => {
        expect(extractVersion({ Version: "v3.0.0" })).toBe("v3.0.0");
    });

    it("returns 'unknown' when no version info exists", () => {
        expect(extractVersion({})).toBe("unknown");
    });
});
