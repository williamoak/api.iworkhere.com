import { describe, it, expect, vi } from "vitest";
import { logger } from "@helpers/logger";
import http from "http";

// Helper to make real HTTP requests to Express app using Node built-in http & fetch
async function testRoute(app: any, path: string, options: RequestInit = {}) {
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address() as any;
    const url = `http://localhost:${address.port}${path}`;
    try {
        const res = await fetch(url, options);
        const text = await res.text();
        return { status: res.status, text, headers: res.headers };
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
}

// --- MOCKS (hoisted by Vitest) ---

const corsMock = vi.fn(() => (_req: any, _res: any, next: any) => next());

vi.mock("cors", () => ({
    default: corsMock,
}));

vi.mock("@loaders/routeLoader", () => ({
    loadRoutes: vi.fn(async () => {}),
}));

vi.mock("@middleware/tenantTransaction", () => ({
    tenantTransaction: vi.fn(() => (_req: any, _res: any, next: any) => next()),
}));

vi.mock("@helpers/config", () => ({
    configGet: vi.fn((key: string) => (key === "DEBUG" ? (process.env.DEBUG ?? "false") : "false")),
    configGetNumber: vi.fn(() => 3600),
}));

// --- TESTS ---

describe("appFactory", () => {
    it("createBaseApp returns an Express app and loads routes", async () => {
        const { createBaseApp } = await import("@src/appFactory");
        const { loadRoutes } = await import("@loaders/routeLoader");

        const app = await createBaseApp();

        // Basic sanity checks
        expect(app).toBeDefined();
        expect(typeof app.use).toBe("function");
        expect(typeof app.listen).toBe("function");

        // Route loader was invoked
        expect(loadRoutes).toHaveBeenCalledTimes(1);
        expect(loadRoutes).toHaveBeenCalledWith(app);
    }, 10000);

    it("createTestApp delegates to createBaseApp", async () => {
        const { createTestApp } = await import("@src/appFactory");

        const app = await createTestApp();

        expect(app).toBeDefined();
        expect(typeof app.use).toBe("function");
    });

    it("allows explicit CORS origin from CORS_ALLOWED_ORIGINS", async () => {
        vi.resetModules();
        corsMock.mockClear();

        process.env.CORS_ALLOWED_ORIGINS = "https://docs.partner.example";

        const { createBaseApp } = await import("@src/appFactory");
        await createBaseApp();

        const corsOptions = (corsMock.mock.calls as unknown as any)[0]?.[0];
        expect(corsOptions).toBeDefined();
        expect(typeof corsOptions.origin).toBe("function");

        await new Promise<void>((resolve, reject) => {
            corsOptions.origin("https://docs.partner.example", (err: unknown, allowed?: boolean) => {
                if (err) {
                    reject(err);
                    return;
                }
                expect(allowed).toBe(true);
                resolve();
            });
        });

        delete process.env.CORS_ALLOWED_ORIGINS;
    });

    it("rejects non-allowlisted external CORS origin", async () => {
        vi.resetModules();
        corsMock.mockClear();

        process.env.CORS_ALLOWED_ORIGINS = "https://docs.partner.example";

        const { createBaseApp } = await import("@src/appFactory");
        await createBaseApp();

        const corsOptions = (corsMock.mock.calls as unknown as any)[0]?.[0];
        expect(corsOptions).toBeDefined();
        expect(typeof corsOptions.origin).toBe("function");

        await new Promise<void>((resolve) => {
            corsOptions.origin("https://evil.example", (err: unknown, allowed?: boolean) => {
                expect(err).toBeInstanceOf(Error);
                expect(allowed).toBe(false);
                resolve();
            });
        });

        delete process.env.CORS_ALLOWED_ORIGINS;
    });

    it("allows iworkhere subdomain origin via regex rule", async () => {
        vi.resetModules();
        corsMock.mockClear();

        delete process.env.CORS_ALLOWED_ORIGINS;

        const { createBaseApp } = await import("@src/appFactory");
        await createBaseApp();

        const corsOptions = (corsMock.mock.calls as unknown as any)[0]?.[0];
        expect(corsOptions).toBeDefined();
        expect(typeof corsOptions.origin).toBe("function");

        await new Promise<void>((resolve, reject) => {
            corsOptions.origin("https://docs.iworkhere.com", (err: unknown, allowed?: boolean) => {
                if (err) {
                    reject(err);
                    return;
                }
                expect(allowed).toBe(true);
                resolve();
            });
        });
    });

    it("allows requests with no origin header or null origin", async () => {
        vi.resetModules();
        corsMock.mockClear();

        const { createBaseApp } = await import("@src/appFactory");
        await createBaseApp();

        const corsOptions = (corsMock.mock.calls as unknown as any)[0]?.[0];
        expect(corsOptions).toBeDefined();
        expect(typeof corsOptions.origin).toBe("function");

        await new Promise<void>((resolve, reject) => {
            corsOptions.origin(undefined, (err: unknown, allowed?: boolean) => {
                if (err) {
                    reject(err);
                    return;
                }
                expect(allowed).toBe(true);
                resolve();
            });
        });

        await new Promise<void>((resolve, reject) => {
            corsOptions.origin("null", (err: unknown, allowed?: boolean) => {
                if (err) {
                    reject(err);
                    return;
                }
                expect(allowed).toBe(true);
                resolve();
            });
        });
    });

    it("trims comma-separated CORS_ALLOWED_ORIGINS entries", async () => {
        vi.resetModules();
        corsMock.mockClear();

        process.env.CORS_ALLOWED_ORIGINS =
            " https://docs.partner.example , https://status.example ";

        const { createBaseApp } = await import("@src/appFactory");
        await createBaseApp();

        const corsOptions = (corsMock.mock.calls as unknown as any)[0]?.[0];
        expect(corsOptions).toBeDefined();
        expect(typeof corsOptions.origin).toBe("function");

        await new Promise<void>((resolve, reject) => {
            corsOptions.origin("https://status.example", (err: unknown, allowed?: boolean) => {
                if (err) {
                    reject(err);
                    return;
                }
                expect(allowed).toBe(true);
                resolve();
            });
        });

        delete process.env.CORS_ALLOWED_ORIGINS;
    });

    it("executes debug logic when DEBUG is true", async () => {
        process.env.DEBUG = "true";
        vi.resetModules();
        const { logger } = await import("@helpers/logger");
        const loggerSpy = vi.spyOn(logger, "log").mockImplementation(() => {});

        const { createBaseApp } = await import("@src/appFactory");
        await createBaseApp();
        
        expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining("[DEBUG]"));
        loggerSpy.mockRestore();
        delete process.env.DEBUG;
    });

    it("executes AUTH_ME_DEBUG request logging logic with diagnostic headers", async () => {
        process.env.DEBUG = "false";
        process.env.AUTH_ME_DEBUG = "true";
        vi.resetModules();
        const { logger } = await import("@helpers/logger");
        const loggerSpy = vi.spyOn(logger, "log").mockImplementation(() => {});

        const { createBaseApp } = await import("@src/appFactory");
        const app = await createBaseApp();

        await testRoute(app, "/", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Forwarded-For": "1.2.3.4",
                "X-Real-IP": "1.2.3.4",
                "X-Request-ID": "req-123",
                "CF-Ray": "ray-123",
                "User-Agent": "test-agent",
                "Origin": "https://test.origin",
                "Referer": "https://test.referer",
            },
            body: JSON.stringify({ test: "data" }),
        });

        expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining("JSON REQUEST"));
        expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining("x-forwarded-for=1.2.3.4"));

        loggerSpy.mockRestore();
        delete process.env.AUTH_ME_DEBUG;
        delete process.env.DEBUG;
    });

    it("serves root route", async () => {
        vi.resetModules();
        delete process.env.DEBUG;
        delete process.env.AUTH_ME_DEBUG;
        const { createBaseApp } = await import("@src/appFactory");
        const app = await createBaseApp();

        const { status } = await testRoute(app, "/");
        expect(status).toBe(200);
    });

    it("serves verification success route", async () => {
        vi.resetModules();
        delete process.env.DEBUG;
        delete process.env.AUTH_ME_DEBUG;
        const { createBaseApp } = await import("@src/appFactory");
        const app = await createBaseApp();

        const { status, text } = await testRoute(app, "/verification-success");
        expect(status).toBe(200);
        expect(text).toContain("Verification Successful!");
    });

    it("serves verification error route with and without query param", async () => {
        vi.resetModules();
        delete process.env.DEBUG;
        delete process.env.AUTH_ME_DEBUG;
        const { createBaseApp } = await import("@src/appFactory");
        const app = await createBaseApp();

        const res1 = await testRoute(app, "/verification-error?error=Invalid+token");
        expect(res1.status).toBe(200);
        expect(res1.text).toContain("Verification Failed");
        expect(res1.text).toContain("Invalid token");

        const res2 = await testRoute(app, "/verification-error");
        expect(res2.status).toBe(200);
        expect(res2.text).toContain("Unknown error");
    });

    it("serves coverage report route", async () => {
        const fs = await vi.importActual<typeof import("fs")>("fs");
        const path = await import("path");
        const coverageDir = path.resolve("coverage");
        const indexFile = path.join(coverageDir, "index.html");
        
        // Ensure coverage directory and a dummy index.html exist for the test
        const dirCreated = !fs.existsSync(coverageDir);
        if (dirCreated) fs.mkdirSync(coverageDir, { recursive: true });
        const fileCreated = !fs.existsSync(indexFile);
        if (fileCreated) fs.writeFileSync(indexFile, "<html><body>Coverage</body></html>");

        try {
            vi.resetModules();
            delete process.env.DEBUG;
            delete process.env.AUTH_ME_DEBUG;
            const { createBaseApp } = await import("@src/appFactory");
            const app = await createBaseApp();

            const { status, text } = await testRoute(app, "/coverage/index.html");
            expect(status).toBe(200);
            expect(text.toLowerCase()).toContain("coverage");
        } finally {
            // Clean up only if we created them
            if (fileCreated && fs.existsSync(indexFile)) fs.unlinkSync(indexFile);
            if (dirCreated && fs.existsSync(coverageDir)) fs.rmdirSync(coverageDir);
        }
    });
});
