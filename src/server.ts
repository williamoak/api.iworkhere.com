import { logger } from '@helpers/logger';

/**
 * @myDocBlock
 * @file server.ts
 * @internal
 * @module Server
 * @tag api
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path src/server.ts
 * @summary HTTP API server (behind nginx TLS termination). Internal traffic is HTTP-only.
 * @description
 *   Provides:
 *     - Plain HTTP Express server intended to run behind nginx reverse proxy.
 *     - nginx performs all public HTTPS termination; Node never serves TLS directly.
 *     - Dynamic route loading via appFactory and src/routes/v1/**.
 *     - CockroachDB connectivity verification before startup.
 * @query {}
 * @requestExample none
 * @response none
 * @requires {
 *   "dependencies": ["src/appFactory.ts", "src/services/dbService.ts", "src/loaders/routeLoader.ts"]
 * }
 */

import "tsconfig-paths/register";
import "@helpers/config";

import http from "http";
;
import { configGet } from "@helpers/config";
import { createBaseApp } from "@src/appFactory";
import { verifyConnection } from "@services/dbService";
import { loadSwagger } from "@loaders/swagger";
import { startCleanupJob } from "@jobs/cleanupExpiredTokens";

// ---------------------------------------------------------------------------
// Bootstrap server (HTTP-only; TLS handled by nginx)
// ---------------------------------------------------------------------------

async function bootstrap() {
    // Ensure CockroachDB is reachable before starting API
    await verifyConnection();

    // Build the Express app using the unified factory
    const app = await createBaseApp();

    // -------------------------------------------------------------------
    // Background Jobs
    // -------------------------------------------------------------------
    const cleanupIntervalMs = Number(
      process.env.CLEANUP_JOB_INTERVAL_MS ?? 3_600_000
    );
    startCleanupJob(cleanupIntervalMs);

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
        logger.log(`API server running at http://${HOST}:${PORT}`);
        logger.log("HTTPS termination is handled by nginx; internal traffic is HTTP-only.");

        if (process.env.NODE_ENV !== "production") {
            logger.log(`Swagger UI available at http://${HOST}:${PORT}/docs`);
        }
    });
}

export { bootstrap };
