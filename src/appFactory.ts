import express from "express";
import { loadRoutes } from "@loaders/routeLoader";

/**
 * Builds the core Express app with middleware and routes.
 * Shared by server.ts (production) and tests.
 */
export async function createBaseApp() {
    const app = express();

    // Basic middleware (same as server.ts)
    app.use(express.json());

    // Register routes
    await loadRoutes(app);

    return app;
}

/**
 * Test-specific wrapper: no HTTPS, no listeners.
 */
export async function createTestApp() {
    return createBaseApp();
}
