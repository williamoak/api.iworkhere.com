import { describe, it, expect, vi } from "vitest";

// --- MOCKS (hoisted by Vitest) ---

const corsMock = vi.fn(() => (_req: any, _res: any, next: any) => next());

vi.mock("cors", () => ({
    default: corsMock,
}));

vi.mock("@loaders/routeLoader", () => ({
    loadRoutes: vi.fn(async () => {}),
}));

vi.mock("@helpers/config", () => ({
    configGet: vi.fn(() => "false"),
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
    });

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

    it("allows requests with no origin header", async () => {
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
});
