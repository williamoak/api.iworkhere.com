import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import http from "http";
import adminRoutes from "@src/admin/adminApp";
import { logger } from "@helpers/logger";

vi.mock("drizzle-orm", () => ({
    eq: vi.fn(),
    desc: vi.fn(),
}));

// Mock auth services
vi.mock("@services/auth/authContext", () => ({
    resolveAuthContext: vi.fn().mockResolvedValue({ applicationId: "app-123" }),
}));

vi.mock("@services/auth/authUserResolver", () => ({
    resolveUserForApplication: vi.fn().mockResolvedValue({ userId: "user-123" }),
}));

vi.mock("@services/auth/passwordService", () => ({
    verifyPassword: vi.fn().mockResolvedValue(true),
}));

vi.mock("@services/auth/tokenService", () => ({
    issueLoginTokens: vi.fn().mockResolvedValue({
        access: {
            token: "mock-access-token",
            expiresAt: new Date(Date.now() + 3600000),
        },
    }),
}));

let mockUserRows: any[] = [{
    username: "adminuser",
    email: "admin@example.com",
    statusCode: "active",
    createdAt: new Date("2025-01-01T00:00:00Z"),
}];

let mockTokenRows: any[] = [{
    createdAt: new Date("2025-01-01T10:00:00Z"),
}];

let selectCallCount = 0;

vi.mock("@services/dbService", async () => {
    const { createDbServiceMock } = await import('../helpers/dbMock');
    return createDbServiceMock({
        select: vi.fn().mockImplementation(() => {
            selectCallCount++;
            const isTokenQuery = selectCallCount % 2 === 0;
            const builder = {
                from: vi.fn().mockImplementation(() => builder),
                where: vi.fn().mockImplementation(() => builder),
                orderBy: vi.fn().mockImplementation(() => builder),
                limit: vi.fn().mockImplementation(() => builder),
                then: vi.fn().mockImplementation((cb: (rows: any[]) => any) => {
                    return Promise.resolve(cb(isTokenQuery ? mockTokenRows : mockUserRows));
                }),
            };
            return builder;
        }),
    });
});

let mockReqAuth: any = { userId: "user-123" };

vi.mock("@middleware/webAuthMiddleware", () => ({
    webAuthMiddleware: (req: any, _res: any, next: any) => {
        if (mockReqAuth) {
            req.auth = mockReqAuth;
        } else {
            delete req.auth;
        }
        next();
    },
}));

async function testRequest(app: any, path: string, options: RequestInit = {}) {
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address() as any;
    const url = `http://localhost:${address.port}${path}`;
    try {
        const res = await fetch(url, { redirect: "manual", ...options });
        const text = await res.text();
        return { status: res.status, text, headers: res.headers };
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
}

describe("adminApp", () => {
    let app: express.Express;

    beforeEach(() => {
        vi.clearAllMocks();
        selectCallCount = 0;
        mockReqAuth = { userId: "user-123" };
        mockUserRows = [{
            username: "adminuser",
            email: "admin@example.com",
            statusCode: "active",
            createdAt: new Date("2025-01-01T00:00:00Z"),
        }];
        mockTokenRows = [{
            createdAt: new Date("2025-01-01T10:00:00Z"),
        }];

        app = express();
        app.use(express.json());
        app.use(express.urlencoded({ extended: true }));
        app.use("/", adminRoutes);
    });

    describe("GET /", () => {
        it("redirects to / when user is unauthenticated", async () => {
            mockReqAuth = null;

            const { status, headers } = await testRequest(app, "/");
            expect(status).toBe(302);
            expect(headers.get("location")).toBe("/");
        });

        it("renders admin dashboard for active authenticated user", async () => {
            const { status, text } = await testRequest(app, "/");
            expect(status).toBe(200);
            expect(text).toContain("Admin Dashboard");
            expect(text).toContain("User: adminuser");
            expect(text).toContain("Email: admin@example.com");
            expect(text).toContain("Enabled: true");
        });

        it("renders dashboard for inactive user with missing session token", async () => {
            mockUserRows = [{
                username: "inactiveuser",
                email: "inactive@example.com",
                statusCode: "disabled",
                createdAt: new Date("2025-01-01T00:00:00Z"),
            }];
            mockTokenRows = [];

            const { status, text } = await testRequest(app, "/");
            expect(status).toBe(200);
            expect(text).toContain("User: inactiveuser");
            expect(text).toContain("Enabled: false");
        });
    });

    describe("POST /login", () => {
        it("successfully logs in user and sets auth_token cookie", async () => {
            const loggerSpy = vi.spyOn(logger, "log").mockImplementation(() => {});

            const { status, headers } = await testRequest(app, "/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    app_key: "my-app",
                    identifier: "adminuser",
                    password: "correctpassword",
                }),
            });

            expect(status).toBe(302);
            expect(headers.get("location")).toBe("/admin");
            expect(headers.get("set-cookie")).toContain("auth_token=mock-access-token");

            loggerSpy.mockRestore();
        });

        it("uses default APP_KEY when app_key is not provided", async () => {
            process.env.APP_KEY = "env-app-key";
            const loggerSpy = vi.spyOn(logger, "log").mockImplementation(() => {});
            const { resolveAuthContext } = await import("@services/auth/authContext");

            const { status } = await testRequest(app, "/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    identifier: "adminuser",
                    password: "correctpassword",
                }),
            });

            expect(status).toBe(302);
            expect(resolveAuthContext).toHaveBeenCalledWith({
                app_key: "env-app-key",
                identifier: "adminuser",
                password: "correctpassword",
            });

            loggerSpy.mockRestore();
            delete process.env.APP_KEY;
        });

        it("handles login failures with 401 error", async () => {
            const loggerErrorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
            const { verifyPassword } = await import("@services/auth/passwordService");
            vi.mocked(verifyPassword).mockRejectedValueOnce(new Error("Invalid password"));

            const { status, text } = await testRequest(app, "/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    identifier: "adminuser",
                    password: "wrongpassword",
                }),
            });

            expect(status).toBe(401);
            expect(text).toBe("Login failed");
            expect(loggerErrorSpy).toHaveBeenCalled();

            loggerErrorSpy.mockRestore();
        });
    });
});
