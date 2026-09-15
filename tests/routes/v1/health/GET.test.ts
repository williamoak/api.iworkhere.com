import { describe, it, expect } from "vitest";
import handler, { __test__ } from "@routes/v1/health/GET";

const {
    generateSchemaFromValue,
    getHealthNode,
    listChildEndpoints,
    executeChildHealth
} = __test__;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function mockReq(routeTree: any, query: any = {}) {
    return {
        query,
        app: {
            locals: { routeTree }
        }
    } as any;
}

/* -------------------------------------------------------------------------- */
/* generateSchemaFromValue                                                     */
/* -------------------------------------------------------------------------- */

describe("generateSchemaFromValue", () => {
    it("handles primitive values", () => {
        expect(generateSchemaFromValue(1)).toBe("number");
        expect(generateSchemaFromValue("x")).toBe("string");
        expect(generateSchemaFromValue(true)).toBe("boolean");
    });

    it("handles null and undefined", () => {
        expect(generateSchemaFromValue(null)).toBe("null");
        expect(generateSchemaFromValue(undefined)).toBe("undefined");
    });

    it("handles arrays", () => {
        expect(generateSchemaFromValue([1, 2, 3])).toEqual(["number"]);
        expect(generateSchemaFromValue(["a"])).toEqual(["string"]);
    });

    it("handles empty arrays", () => {
        expect(generateSchemaFromValue([])).toEqual(["unknown"]);
    });

    it("handles nested objects", () => {
        const input = {
            uptime: 123,
            flags: ["a", "b"],
            sys: {
                total: 10,
                used: 5
            }
        };

        expect(generateSchemaFromValue(input)).toEqual({
            uptime: "number",
            flags: ["string"],
            sys: {
                total: "number",
                used: "number"
            }
        });
    });
});

/* -------------------------------------------------------------------------- */
/* RouteTree helpers                                                           */
/* -------------------------------------------------------------------------- */

describe("routeTree helpers", () => {
    it("returns the health node", () => {
        const req = mockReq({
            "/v1/health": { children: {} }
        });

        expect(getHealthNode(req)).toBeDefined();
    });

    it("throws if /v1/health node is missing", () => {
        const req = mockReq({});

        expect(() => getHealthNode(req))
            .toThrow("routeTree missing /v1/health");
    });

    it("lists child endpoints", () => {
        const req = mockReq({
            "/v1/health": {
                children: {
                    api: {},
                    database: {}
                }
            }
        });

        expect(listChildEndpoints(req))
            .toEqual(["api", "database"]);
    });
});

/* -------------------------------------------------------------------------- */
/* executeChildHealth                                                          */
/* -------------------------------------------------------------------------- */

describe("executeChildHealth", () => {
    it("returns failure if child endpoint does not exist", async () => {
        const req = mockReq({
            "/v1/health": { children: {} }
        });

        const result = await executeChildHealth(req, "missing");

        expect(result.status).toBe("fail");
        const data0 = result.data as any;
        expect(data0.error).toContain("not found");
    });

    it("returns failure if no GET handler exists", async () => {
        const req = mockReq({
            "/v1/health": {
                children: {
                    api: { handlers: {} }
                }
            }
        });

        const result = await executeChildHealth(req, "api");

        expect(result.status).toBe("fail");
        const data1 = result.data as any;
        expect(data1.error).toContain("No GET handler");
    });

    it("executes a valid child GET handler", async () => {
        const req = mockReq({
            "/v1/health": {
                children: {
                    api: {
                        handlers: {
                            GET: async () => ({
                                status: "ok",
                                name: "api",
                                data: { uptime: 1 }
                            })
                        }
                    }
                }
            }
        });

        const result = await executeChildHealth(req, "api");

        expect(result.status).toBe("ok");
        const data2 = result.data as any;
        expect(data2.uptime).toBe(1);
    });

    it("wraps non-standard return values", async () => {
        const req = mockReq({
            "/v1/health": {
                children: {
                    api: {
                        handlers: {
                            GET: async () => ({ foo: "bar" })
                        }
                    }
                }
            }
        });

        const result = await executeChildHealth(req, "api");

        expect(result.status).toBe("ok");
        const data3 = result.data as any;
        expect(data3).toEqual({ foo: "bar" });
    });

    it("handles thrown errors gracefully", async () => {
        const req = mockReq({
            "/v1/health": {
                children: {
                    api: {
                        handlers: {
                            GET: async () => {
                                throw new Error("boom");
                            }
                        }
                    }
                }
            }
        });

        const result = await executeChildHealth(req, "api");

        expect(result.status).toBe("fail");
        const data4 = result.data as any;
        expect(data4.error).toContain("boom");
    });
});

/* -------------------------------------------------------------------------- */
/* Main Handler                                                               */
/* -------------------------------------------------------------------------- */

describe("health main handler", () => {
    it("returns endpoint names when no query is provided", async () => {
        const req = mockReq({
            "/v1/health": {
                children: {
                    api: {},
                    database: {},
                },
            },
        });

        const result = await handler(req);

        expect(result.status).toBe("ok");
        expect(result.name).toBe("health-index");
        expect(result.data.endpoints).toEqual(["api", "database"]);
    });

    it("generates schemas when ?all is provided", async () => {
        const req = mockReq(
            {
                "/v1/health": {
                    children: {
                        api: {
                            handlers: {
                                GET: async () => ({
                                    status: "ok",
                                    name: "api",
                                    data: { uptime: 123, alive: true },
                                }),
                            },
                        },
                    },
                },
            },
            { all: "true" }
        );

        const result = await handler(req);

        expect(result.status).toBe("ok");
        expect(result.data.endpoints).toEqual([
            {
                name: "api",
                responseSchema: {
                    uptime: "number",
                    alive: "boolean",
                },
            },
        ]);
    });

    it("returns complete health check results when ?complete is provided", async () => {
        const req = mockReq(
            {
                "/v1/health": {
                    children: {
                        database: {
                            handlers: {
                                GET: async () => ({
                                    status: "ok",
                                    name: "database",
                                    data: { connected: true },
                                }),
                            },
                        },
                    },
                },
            },
            { complete: "true" }
        );

        const result = await handler(req);

        expect(result.status).toBe("ok");
        expect(result.data.results).toEqual({
            database: {
                status: "ok",
                name: "database",
                data: { connected: true },
            },
        });
    });
});
