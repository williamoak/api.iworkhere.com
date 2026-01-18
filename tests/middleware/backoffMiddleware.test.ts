import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("backoffMiddleware", () => {

    beforeEach(() => {
        // Reset module-level state (counters Map)
        vi.resetModules();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    function mockReq(path = "/v1/test") {
        return {
            method: "GET",
            path,
            route: { path },
        } as any;
    }

    function mockRes() {
        const listeners: Record<string, Function[]> = {};

        return {
            statusCode: 200,
            headers: {} as Record<string, string>,
            body: null as any,

            setHeader(key: string, value: string) {
                this.headers[key] = value;
            },

            status(code: number) {
                this.statusCode = code;
                return this;
            },

            json(payload: any) {
                this.body = payload;
                return this;
            },

            once(event: string, cb: Function) {
                listeners[event] ??= [];
                listeners[event].push(cb);
            },

            // Helper to simulate response lifecycle completion
            emit(event: string) {
                for (const cb of listeners[event] ?? []) {
                    cb();
                }
            },
        } as any;
    }

    it("admits request immediately when under concurrency limit", async () => {
        const { backoffMiddleware } = await import(
            "@middleware/backoffMiddleware"
            );

        const mw = backoffMiddleware(1);
        const req = mockReq();
        const res = mockRes();
        const next = vi.fn();

        await mw(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(res.statusCode).toBe(200);
    });

    it("waits with backoff until a slot becomes available", async () => {
        const { backoffMiddleware } = await import(
            "@middleware/backoffMiddleware"
            );

        const mw = backoffMiddleware(1, 1000);

        const req1 = mockReq();
        const res1 = mockRes();
        const next1 = vi.fn();

        const req2 = mockReq();
        const res2 = mockRes();
        const next2 = vi.fn();

        // First request occupies the only slot
        await mw(req1, res1, next1);
        expect(next1).toHaveBeenCalled();

        // Second request enters backoff loop
        const p2 = mw(req2, res2, next2);

        // Let at least one backoff delay resolve
        await vi.runOnlyPendingTimersAsync();

        // Free the slot
        res1.emit("finish");

        // Allow promise chain to continue
        await vi.runOnlyPendingTimersAsync();
        await p2;

        expect(next2).toHaveBeenCalled();
        expect(res2.statusCode).toBe(200);
    });

    it("returns 429 when maxWaitMs is exceeded", async () => {
        const { backoffMiddleware } = await import(
            "@middleware/backoffMiddleware"
            );

        // Very small wait window to force rejection
        const mw = backoffMiddleware(1, 10);

        const req1 = mockReq();
        const res1 = mockRes();
        const next1 = vi.fn();

        const req2 = mockReq();
        const res2 = mockRes();
        const next2 = vi.fn();

        // First request holds the slot
        await mw(req1, res1, next1);
        expect(next1).toHaveBeenCalled();

        // Second request should exceed maxWaitMs
        const p2 = mw(req2, res2, next2);

        await vi.runAllTimersAsync();
        await p2;

        expect(next2).not.toHaveBeenCalled();
        expect(res2.statusCode).toBe(429);
        expect(res2.headers["Retry-After"]).toBe("1");
        expect(res2.body).toEqual({
            error: "TOO_MANY_REQUESTS",
            message: "Server is busy, please retry shortly",
        });
    });
});
