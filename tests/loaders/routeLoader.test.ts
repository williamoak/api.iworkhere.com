import { describe, expect, test, vi, beforeEach } from "vitest";

const {
    authMwHandler,
    authMiddlewareFactory,
    validatorRequest,
} = vi.hoisted(() => ({
    authMwHandler: vi.fn((_req, _res, next) => next()),
    authMiddlewareFactory: vi.fn(),
    validatorRequest: vi.fn((_req, _res, next) => next()),
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
    rateLimitMiddleware: vi.fn(() => (_req, _res, next) => next()),
}));

vi.mock("@middleware/cacheMiddleware", () => ({
    cacheMiddleware: vi.fn(() => (_req, _res, next) => next()),
}));

import { __test__ } from "@loaders/routeLoader";

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

describe("routeLoader auth gating", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

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
