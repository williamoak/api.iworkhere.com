import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import http from "http";
import fsp from "fs/promises";
import path from "path";
import os from "os";

const {
    authMwHandler,
    authMiddlewareFactory,
    validatorRequest,
    loggerLogSpy,
} = vi.hoisted(() => ({
    authMwHandler: vi.fn((_req, _res, next) => next()),
    authMiddlewareFactory: vi.fn(),
    validatorRequest: vi.fn((_req, _res, next) => next()),
    loggerLogSpy: vi.fn(),
}));

authMiddlewareFactory.mockImplementation(() => authMwHandler);

vi.mock("@middleware/authMiddleware", () => ({
    authMiddleware: authMiddlewareFactory,
}));

vi.mock("@middleware/validate", () => ({
    makeValidator: vi.fn(() => ({
        request: validatorRequest,
        response: <T>(data: T) => data,
    })),
}));

vi.mock("@middleware/throttleMiddleware", () => ({
    throttleMiddleware: vi.fn(() => (_req, _res, next) => next()),
}));

vi.mock("@middleware/rateLimitMiddleware", () => ({
    rateLimitMiddleware: vi.fn((opts: any) => (req: any, _res: any, next: any) => {
        if (opts && typeof opts.key === "function") {
            opts.key(req);
        }
        next();
    }),
}));

vi.mock("@middleware/cacheMiddleware", () => ({
    cacheMiddleware: vi.fn(() => (_req, _res, next) => next()),
}));

vi.mock("@helpers/logger", () => ({
    logger: {
        log: loggerLogSpy,
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
    },
}));

vi.mock("@helpers/config", () => ({
    configGet: vi.fn((key: string) => {
        if (key === "API_VERSION") return "loader_test_v1";
        if (key === "MAX_CONCURRENT_REQUESTS") return "10";
        return undefined;
    }),
}));

vi.mock("@services/dbService", () => ({
    db: {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue([]),
    },
}));

vi.mock("drizzle-orm", () => ({
    eq: vi.fn(),
    desc: vi.fn(),
    sql: vi.fn(),
}));

import { loadRoutes, __test__ } from "@loaders/routeLoader";

function createAppMock() {
    return {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        patch: vi.fn(),
        all: vi.fn(),
    };
}

async function testRequest(app: any, routePath: string, options: RequestInit = {}) {
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address() as any;
    const url = `http://localhost:${address.port}${routePath}`;
    try {
        const res = await fetch(url, { redirect: "manual", ...options });
        const text = await res.text();
        let json: any = null;
        try {
            json = JSON.parse(text);
        } catch {
            // non-json body
        }
        return { status: res.status, text, json, headers: res.headers };
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
}

describe("routeLoader", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env.ROUTE_LOADER_DEBUG;
    });

    afterEach(() => {
        delete process.env.ROUTE_LOADER_DEBUG;
    });

    describe("auth gating", () => {
        test("bindExpress includes auth middleware only for authRequired routes", () => {
            const app = createAppMock();

            const routeTree: Record<string, any> = {
                "/v1/public": {
                    path: "/v1/public",
                    file: "/tmp/public/GET.ts",
                    handlers: {
                        GET: vi.fn(),
                    },
                    schemas: {},
                    children: {},
                    authRequiredByMethod: {
                        GET: false,
                    },
                },
                "/v1/private": {
                    path: "/v1/private",
                    file: "/tmp/private/GET.ts",
                    handlers: {
                        GET: vi.fn(),
                    },
                    schemas: {},
                    children: {},
                    authRequiredByMethod: {
                        GET: true,
                    },
                },
            };

            __test__.bindExpress({
                app: app as any,
                routeTree,
                maxConcurrentRequests: 10,
                apiVersion: "v1",
            });

            const publicCall = app.get.mock.calls.find(
                (args) => args[0] === "/v1/public"
            );
            const privateCall = app.get.mock.calls.find(
                (args) => args[0] === "/v1/private"
            );

            expect(publicCall).toBeDefined();
            expect(privateCall).toBeDefined();

            expect(authMiddlewareFactory).toHaveBeenCalledTimes(1);
            expect(publicCall!.slice(1)).not.toContain(authMwHandler);
            expect(privateCall!.slice(1)).toContain(authMwHandler);
        });
    });

    describe("loadRoutes", () => {
        let loaderTestDir: string;

        beforeEach(async () => {
            loaderTestDir = path.join(process.cwd(), "src", "routes", "loader_test_v1");
            await fsp.mkdir(loaderTestDir, { recursive: true });
            await fsp.writeFile(
                path.join(loaderTestDir, "GET.ts"),
                `export default function getHandler() { return { ok: true }; }\n`
            );
        });

        afterEach(async () => {
            if (loaderTestDir) {
                await fsp.rm(loaderTestDir, { recursive: true, force: true });
            }
        });

        test("loads routes from configured routes directory and sets routeTree", async () => {
            const app = express();
            await loadRoutes(app);

            expect(app.locals.routeTree).toBeDefined();
            expect(Object.keys(app.locals.routeTree).length).toBeGreaterThan(0);
            expect(loggerLogSpy).toHaveBeenCalledWith(
                expect.stringContaining("RouteLoader: Registered")
            );
        });
    });

    describe("scanDirectory", () => {
        let tempDir: string;

        beforeEach(async () => {
            tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "route-test-"));
        });

        afterEach(async () => {
            if (tempDir) {
                await fsp.rm(tempDir, { recursive: true, force: true });
            }
        });

        test("scans method files and recursively discovers child routes", async () => {
            const getFilePath = path.join(tempDir, "GET.ts");
            await fsp.writeFile(
                getFilePath,
                `export default function getHandler() { return { ok: true }; }\n` +
                `export const schema = { query: {} };\n` +
                `export const authRequired = true;\n`
            );

            const ignoredFilePath = path.join(tempDir, "README.txt");
            await fsp.writeFile(ignoredFilePath, "documentation");

            const childDir = path.join(tempDir, "sub");
            await fsp.mkdir(childDir);
            const postFilePath = path.join(childDir, "POST.ts");
            await fsp.writeFile(
                postFilePath,
                `export default function postHandler() { return { created: true }; }\n`
            );

            const routeTree: Record<string, any> = {};
            await __test__.scanDirectory({
                dir: tempDir,
                routePath: "/v1/test",
                routeTree,
            });

            expect(routeTree["/v1/test"]).toBeDefined();
            expect(routeTree["/v1/test"].handlers.GET).toBeInstanceOf(Function);
            expect(routeTree["/v1/test"].authRequiredByMethod.GET).toBe(true);

            expect(routeTree["/v1/test/sub"]).toBeDefined();
            expect(routeTree["/v1/test/sub"].handlers.POST).toBeInstanceOf(Function);

            // First registration wins guard
            await __test__.scanDirectory({
                dir: tempDir,
                routePath: "/v1/test",
                routeTree,
            });
            expect(routeTree["/v1/test"].handlers.GET).toBeDefined();
        });

        test("throws error when method module lacks default export", async () => {
            const putFilePath = path.join(tempDir, "PUT.ts");
            await fsp.writeFile(putFilePath, `export const someValue = 123;\n`);

            const routeTree: Record<string, any> = {};
            await expect(
                __test__.scanDirectory({
                    dir: tempDir,
                    routePath: "/v1/bad",
                    routeTree,
                })
            ).rejects.toThrow("missing default export");
        });
    });

    describe("bindExpress execution pipeline", () => {
        test("executes handler, autoresponds when headersNotSent, handles pre-sent headers and errors", async () => {
            const app = express();
            app.use(express.json());

            const routeTree: Record<string, any> = {
                "/v1/auto": {
                    path: "/v1/auto",
                    file: "/tmp/auto/GET.ts",
                    handlers: {
                        GET: async () => ({ status: "auto" }),
                    },
                    schemas: {},
                    children: {},
                    authRequiredByMethod: { GET: false },
                },
                "/v1/manual": {
                    path: "/v1/manual",
                    file: "/tmp/manual/GET.ts",
                    handlers: {
                        GET: async (_req: any, res: any) => {
                            res.status(202).json({ status: "manual" });
                            return { status: "ignored" };
                        },
                    },
                    schemas: {},
                    children: {},
                    authRequiredByMethod: { GET: false },
                },
                "/v1/error": {
                    path: "/v1/error",
                    file: "/tmp/error/GET.ts",
                    handlers: {
                        GET: async () => {
                            throw new Error("Handler failure");
                        },
                    },
                    schemas: {},
                    children: {},
                    authRequiredByMethod: { GET: false },
                },
            };

            __test__.bindExpress({
                app: app as any,
                routeTree,
                maxConcurrentRequests: 10,
                apiVersion: "v1",
            });

            // Error handling middleware
            app.use((err: any, _req: any, res: any, _next: any) => {
                res.status(500).json({ error: err.message });
            });

            const resAuto = await testRequest(app, "/v1/auto");
            expect(resAuto.status).toBe(200);
            expect(resAuto.json).toEqual({ status: "auto" });

            const resManual = await testRequest(app, "/v1/manual");
            expect(resManual.status).toBe(202);
            expect(resManual.json).toEqual({ status: "manual" });

            const resErr = await testRequest(app, "/v1/error");
            expect(resErr.status).toBe(500);
            expect(resErr.json).toEqual({ error: "Handler failure" });
        });

        test("triggers debug logs and trace points when ROUTE_LOADER_DEBUG is 1", async () => {
            process.env.ROUTE_LOADER_DEBUG = "1";
            vi.resetModules();
            const { __test__: testModule } = await import("@loaders/routeLoader");

            const app = express();
            app.use(express.json());

            const routeTree: Record<string, any> = {
                "/v1/auth/test": {
                    path: "/v1/auth/test",
                    file: "/tmp/auth/GET.ts",
                    handlers: {
                        GET: async () => ({ auth: true }),
                    },
                    schemas: {},
                    children: {},
                    authRequiredByMethod: { GET: true },
                },
            };

            testModule.bindExpress({
                app: app as any,
                routeTree,
                maxConcurrentRequests: 10,
                apiVersion: "v1",
            });

            const res = await testRequest(app, "/v1/auth/test", {
                headers: { "x-request-id": "req-12345", authorization: "Bearer xyz" },
            });

            expect(res.status).toBe(200);
            expect(loggerLogSpy).toHaveBeenCalledWith(
                expect.stringContaining('"tag":"routeLoader"')
            );
            expect(loggerLogSpy).toHaveBeenCalledWith(
                expect.stringContaining('"reqId":"req-12345"')
            );
        });

        test("exercises all rate limit policies and key extraction logic", async () => {
            const app = express();
            app.use(express.json());

            const authPaths = [
                { path: "/v1/auth/login", method: "POST", body: { email: " TEST@EXAMPLE.COM " } },
                { path: "/v1/auth/register", method: "PUT", body: { identifier: " USER123 " } },
                { path: "/v1/auth/passreset/initiate", method: "PUT", body: {} },
                { path: "/v1/auth/emailverify/resend", method: "PUT", body: {} },
                { path: "/v1/auth/refresh", method: "PUT", body: {} },
                { path: "/v1/auth/emailverify", method: "PUT", body: {} },
                { path: "/v1/auth/passreset/verify", method: "PUT", body: {} },
                { path: "/v1/auth/passreset/complete", method: "PUT", body: {} },
                { path: "/v1/auth/token", method: "DELETE", body: {} },
                { path: "/v1/auth/me", method: "GET", body: {} },
                { path: "/v1/auth/eula", method: "GET", body: {} },
                { path: "/v1/auth/custom", method: "POST", body: {} },
            ];

            const routeTree: Record<string, any> = {};
            for (const item of authPaths) {
                routeTree[item.path] = {
                    path: item.path,
                    file: `/tmp${item.path}/${item.method}.ts`,
                    handlers: {
                        [item.method]: async () => ({ ok: true }),
                    },
                    schemas: {},
                    children: {},
                    authRequiredByMethod: { [item.method]: false },
                };
            }

            __test__.bindExpress({
                app: app as any,
                routeTree,
                maxConcurrentRequests: 10,
                apiVersion: "v1",
            });

            for (const item of authPaths) {
                const res = await testRequest(app, item.path, {
                    method: item.method,
                    headers: { "Content-Type": "application/json" },
                    body: item.method !== "GET" && item.method !== "DELETE" ? JSON.stringify(item.body) : undefined,
                });
                expect(res.status).toBe(200);
            }
        });

        test("register405 handles allowed methods passthrough and returns 405 for unsupported methods", async () => {
            const app = express();
            app.use(express.json());

            const routeTree: Record<string, any> = {
                "/v1/resource": {
                    path: "/v1/resource",
                    file: "/tmp/resource/GET.ts",
                    handlers: {
                        GET: async () => ({ resource: true }),
                    },
                    schemas: {},
                    children: {},
                    authRequiredByMethod: { GET: false },
                },
            };

            __test__.bindExpress({
                app: app as any,
                routeTree,
                maxConcurrentRequests: 10,
                apiVersion: "v1",
            });

            const resAllowed = await testRequest(app, "/v1/resource", { method: "GET" });
            expect(resAllowed.status).toBe(200);

            const resDisallowed = await testRequest(app, "/v1/resource", { method: "DELETE" });
            expect(resDisallowed.status).toBe(405);
            expect(resDisallowed.json).toEqual({
                error: "METHOD_NOT_ALLOWED",
                message: "DELETE not allowed for /v1/resource",
                supportedMethods: ["GET"],
            });

            // Test register405 when method is allowed
            const req = { method: "GET" } as any;
            const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
            const next = vi.fn();

            let register405Handler: any;
            const mockApp = createAppMock();
            mockApp.all = vi.fn((_path: string, fn: any) => {
                register405Handler = fn;
            }) as any;

            __test__.bindExpress({
                app: mockApp as any,
                routeTree,
                maxConcurrentRequests: 10,
                apiVersion: "v1",
            });

            expect(register405Handler).toBeDefined();
            register405Handler(req, res, next);
            expect(next).toHaveBeenCalled();
        });
    });
});
