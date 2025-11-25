import { createTestApp as createRealTestApp } from "@src/appFactory";

/**
 * Wrapper used by tests.
 * This keeps a stable import path (@tests/support/appFactory)
 * even if the real appFactory grows new features later.
 */
export async function createTestApp() {
    return createRealTestApp();
}
