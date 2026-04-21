import { describe, it, expect, beforeEach, vi } from "vitest";

describe("throttleMiddleware", () => {

    beforeEach(() => {
        // Reset module-level state (counters Map)
        vi.resetModules();
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

            // helper to simulate response lifecycle completion
            emit(event: string) {
                for (const cb of listeners[event] ?? []) {
                    cb();
                }
            },
        } as any;
    }

    it("allows request when under concurrency limit", async () => {
        const { throttleMiddleware } = await import(
            "src/middleware/throttleMiddleware"
            );

        const mw = throttleMiddleware(1);

        const req = mockReq();
        const res = mockRes();
        const next = vi.fn();

        await mw(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(res.statusCode).toBe(200);
    });

    it("rejects request immediately when concurrency limit is reached", async () => {
        const { throttleMiddleware } = await import(
            "src/middleware/throttleMiddleware"
            );

        const mw = throttleMiddleware(1);

        const req1 = mockReq();
        const res1 = mockRes();
        const next1 = vi.fn();

        const req2 = mockReq();
        const res2 = mockRes();
        const next2 = vi.fn();

        // First request occupies the slot
        await mw(req1, res1, next1);
        expect(next1).toHaveBeenCalled();

        // Second request should be rejected
        await mw(req2, res2, next2);

        expect(next2).not.toHaveBeenCalled();
        expect(res2.statusCode).toBe(429);
        expect(res2.headers["Retry-After"]).toBe("1");
        expect(res2.body).toEqual({
            error: "TOO_MANY_REQUESTS",
            message: "Too many concurrent requests",
        });
    });

    it("releases concurrency slot when response finishes", async () => {
        const { throttleMiddleware } = await import(
            "src/middleware/throttleMiddleware"
            );

        const mw = throttleMiddleware(1);

        const req1 = mockReq();
        const res1 = mockRes();
        const next1 = vi.fn();

        const req2 = mockReq();
        const res2 = mockRes();
        const next2 = vi.fn();

        // First request enters
        await mw(req1, res1, next1);
        expect(next1).toHaveBeenCalled();

        // Finish first request
        res1.emit("finish");

        // Second request should now be allowed
        await mw(req2, res2, next2);
        expect(next2).toHaveBeenCalled();
        expect(res2.statusCode).toBe(200);
    });
});
