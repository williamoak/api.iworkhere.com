/**
 * @file server.ts
 * @internal
 * @module Server
 * @tag api
 * @version 2.0.0
 * @path src/server.ts
 * @summary HTTP API server (behind nginx TLS termination). Internal traffic is HTTP-only.
 * @description
 *   Provides:
 *     - Plain HTTP Express server intended to run behind nginx reverse proxy.
 *     - nginx performs all public HTTPS termination; Node never serves TLS directly.
 *     - Dynamic route loading via appFactory and src/routes/v1/**.
 *     - CockroachDB connectivity verification before startup.
 *
 * @requestExample
 *   {
 *     "method": "GET",
 *     "url": "https://api.iworkhere.com/v1/health",
 *     "headers": {
 *       "Accept": "application/json"
 *     }
 *   }
 *
 * @response
 *   {
 *     "service": "api.iworkhere.com",
 *     "status": "ok",
 *     "uptime": 12345,
 *     "timestamp": "2025-01-01T12:00:00.000Z"
 *   }
 *
 * @requires
 *   {
 *     "modules": [
 *       "src/appFactory.ts",
 *       "src/services/dbService.ts",
 *       "src/loaders/routeLoader.ts"
 *     ]
 *   }
 */

import "tsconfig-paths/register";
import "@helpers/config";

import http from "http";
import { configGet } from "@helpers/config";
import { createBaseApp } from "@src/appFactory";
import { verifyConnection } from "@services/dbService";
import { loadSwagger } from "@loaders/swagger";

// ---------------------------------------------------------------------------
// Bootstrap server (HTTP-only; TLS handled by nginx)
// ---------------------------------------------------------------------------

async function bootstrap() {
    // Ensure CockroachDB is reachable before starting API
    await verifyConnection();

    // Build the Express app using the unified factory
    const app = await createBaseApp();

    // -------------------------------------------------------------------
    // DEV-ONLY: Swagger UI
    // -------------------------------------------------------------------
    if (process.env.NODE_ENV !== "production") {
        loadSwagger(app);
    }

    const PORT = 4300;

    // HTTP-only server; nginx performs TLS termination
    const HOST = configGet("HOST_IP");

    http.createServer(app).listen(PORT, HOST, () => {
        console.log(`API server running at http://${HOST}:${PORT}`);
        console.log("HTTPS termination is handled by nginx; internal traffic is HTTP-only.");

        if (process.env.NODE_ENV !== "production") {
            console.log(`Swagger UI available at http://${HOST}:${PORT}/docs`);
        }
    });
}

export { bootstrap };

/**
 * @myTestingHints
 *
 * @language TypeScript
 * @runtime cli (long-running HTTP server process)
 *
 * @harness
 *   - primary: Jest (ts-jest, Node environment)
 *   - alternatives: Vitest (node environment, coverage via c8)
 *
 * @coverage
 *   - target: ≥ 80% statements/branches
 *   - rationale:
 *       HTTP-only startup simplifies testing; TLS paths removed.
 *   - exclude:
 *       - Node internals of http.createServer
 *
 * @entryPoints
 *   - bootstrap()
 *
 * @dependencies
 *   @env none
 *
 *   @io
 *     - network:
 *         - HTTP server bind on port 4300
 *
 * @external  
 *     - @services/dbService.verifyConnection
 *     - @src/appFactory.createBaseApp
 *
 * @happyPath
 *   - verifyConnection() resolves successfully
 *   - Express app is created and attached to HTTP server
 *   - Server logs correct startup message
 *
 * @validation
 *   - If CockroachDB is unreachable, bootstrap() must fail and not start server
 *
 * @errorHandling
 *   - Any exception during bootstrap logs an error in start.ts and terminates process
 *
 * @edgeCases
 *   - Port already in use
 *   - verifyConnection() slow or intermittent
 *
 * @security
 *   - No TLS keys/certs are handled in this process
 *   - All public HTTPS handling is delegated to nginx
 *
 * @performance
 *   - Minimal startup overhead; filesystem scanning removed
 *   - No TLS handshake cost inside Node API
 *
 * @notes
 *   - Tests should mock verifyConnection() to avoid real DB connections
 *   - Route loading behavior is validated in routeLoader-level tests
 */
