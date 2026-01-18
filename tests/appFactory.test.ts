import { describe, it, expect, vi } from "vitest";

// --- MOCKS (hoisted by Vitest) ---

vi.mock("@loaders/routeLoader", () => ({
    loadRoutes: vi.fn(async () => {}),
}));

vi.mock("@helpers/config", () => ({
    configGet: vi.fn(() => "false"),
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
});
