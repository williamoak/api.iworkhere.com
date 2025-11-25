import { describe, it, expect } from "vitest";
import request from "supertest";
import fs from "fs";
import path from "path";
import { createTestApp } from "@tests/support/appFactory";

//
// Utility: recursively walk folders for GET.ts/POST.ts/etc.
//
function discoverRouteFiles(dir: string, prefix = "/v1"): Array<{ method: string; url: string }> {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const results: Array<{ method: string; url: string }> = [];

    for (const entry of entries) {
        const full = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            const subPrefix = prefix + "/" + entry.name;
            results.push(...discoverRouteFiles(full, subPrefix));
        } else {
            const m = entry.name.match(/^(GET|POST|PUT|DELETE|PATCH)\.ts$/i);
            if (!m) continue;

            const method = m[1].toLowerCase();
            results.push({ method, url: prefix });
        }
    }

    return results;
}

// MAIN TEST SUITE
describe("routeLoader - functional verification without Express internals", () => {
    const baseRoutesDir = path.join(process.cwd(), "src/routes/v1");
    const discovered = discoverRouteFiles(baseRoutesDir);
    it("discovers at least one route file", () => {
        expect(discovered.length).toBeGreaterThan(0);
    });
    describe("all discovered routes work", () => {
        let app: any;
        it("bootstraps test app", async () => {
            app = await createTestApp();
            expect(app).toBeDefined();
        });
        for (const route of discovered) {
            it(`${route.method.toUpperCase()} ${route.url} returns a valid response`, async () => {
                const agent = request(app);
                const methodDispatch: Record<string, (url: string) => Promise<request.Response>> = {
                    get: (u) => agent.get(u),
                    post: (u) => agent.post(u),
                    put: (u) => agent.put(u),
                    delete: (u) => agent.delete(u),
                    patch: (u) => agent.patch(u),
                };
                const call = methodDispatch[route.method];
                expect(call).toBeDefined();
                const res = await call(route.url);
                expect(res.status).toBeLessThan(500);
                expect(res.status).not.toBe(404);
            });
        }
    });
});
