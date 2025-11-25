/**
 * @file server.ts
 * @external none
 * @module Server
 * @tag api
 * @version 1.3.1
 * @path src/server.ts
 * @summary HTTPS API server (TLS-only). Internal requests use Undici dispatcher.
 * @description
 *   Provides:
 *     - HTTPS Express server using server-side TLS only.
 *     - Internal HTTPS fetch via Undici dispatcher (mTLS not required externally).
 *     - Automatic hostname discovery from TLS certificate (SAN > CN).
 *     - Automatic CockroachDB mTLS detection.
 *     - Dynamic route loading from src/routes/v1/**.
 *
 * @requestExample none
 * @response none
 * @requires src/loaders/routeLoader.ts
 */

import "tsconfig-paths/register";
import "@helpers/config";

import fs from "fs";
import https from "https";
import { Agent as UndiciAgent } from "undici";

import { createBaseApp } from "@src/appFactory";
import { configGet } from "@helpers/config";
import { verifyConnection, db } from "@services/dbService";

// ---------------------------------------------------------------------------
// Environment & paths
// ---------------------------------------------------------------------------

const API_CERT_DIR = configGet("API_CERT_DIR");
const ROOT_CA_CERT = configGet("ROOT_CA_CERT");

// ---------------------------------------------------------------------------
// HTTPS server certificate loader
// ---------------------------------------------------------------------------

function loadHttpsOptions() {
    const keyFile = `${API_CERT_DIR}/api.iworkhere.com.key`;
    const crtFile = `${API_CERT_DIR}/api.iworkhere.com.crt`;

    return {
        cert: fs.readFileSync(crtFile),
        key: fs.readFileSync(keyFile),
        requestCert: false,
        rejectUnauthorized: false
    };
}

const httpsOptions = loadHttpsOptions();

// ---------------------------------------------------------------------------
// Hostname discovery (SAN > CN > fallback)
// ---------------------------------------------------------------------------

function getHttpsHostname(): string {
    try {
        const certFiles = fs.readdirSync(API_CERT_DIR)
            .filter(f => f.endsWith(".crt"))
            .map(f => `${API_CERT_DIR}/${f}`);

        for (const file of certFiles) {
            try {
                const pem = fs.readFileSync(file, "utf8");

                // Prefer SAN DNS entries
                const sanMatches = pem.match(/DNS:([^\s,]+)/g);
                if (sanMatches && sanMatches.length > 0) {
                    const firstDns = sanMatches[0].replace("DNS:", "").trim();
                    if (firstDns) return firstDns;
                }

                // Fallback to CN
                const cnMatch = pem.match(/CN=([^,\n]+)/);
                if (cnMatch && cnMatch[1]) {
                    return cnMatch[1].trim();
                }
            } catch {
                // continue to next cert
            }
        }

        return "unknown-host";
    } catch {
        return "unknown-host";
    }
}

const HOSTNAME = getHttpsHostname();

// ---------------------------------------------------------------------------
// Internal Undici dispatcher
// ---------------------------------------------------------------------------

const internalDispatcher = new UndiciAgent({
    connect: {
        ca: fs.readFileSync(ROOT_CA_CERT, "utf8"),
        servername: HOSTNAME,
        keepAlive: true
    }
});
export { internalDispatcher };

// ---------------------------------------------------------------------------
// CockroachDB mTLS detection
// ---------------------------------------------------------------------------

const isCockroachMtlsEnabled = (): boolean => {
    const ssl = (db.options as any)?.ssl;

    return Boolean(
        ssl &&
        ssl.ca &&
        ssl.cert &&
        ssl.key &&
        ssl.rejectUnauthorized === true
    );
};

// ---------------------------------------------------------------------------
// Bootstrap server
// ---------------------------------------------------------------------------

async function bootstrap() {
    // Ensure CockroachDB is reachable before starting API
    await verifyConnection();

    // Build the Express app using the unified factory
    const app = await createBaseApp();

    const PORT = 4300;

    https.createServer(httpsOptions, app).listen(PORT, () => {
        const httpsActive = Boolean(httpsOptions.cert && httpsOptions.key);
        const cockroachMtlsActive = isCockroachMtlsEnabled();

        console.log(`API server running at https://${HOSTNAME}:${PORT}`);

        console.log(
            httpsActive
                ? "Client HTTPS is ENABLED and ACTIVE."
                : "Client HTTPS is NOT active (certificate missing)."
        );

        console.log(
            cockroachMtlsActive
                ? "CockroachDB mTLS is ENABLED and ACTIVE."
                : "CockroachDB mTLS is NOT active."
        );
    });
}

// ---------------------------------------------------------------------------
// Start API server
// Only start the server if not running under Vitest
// ---------------------------------------------------------------------------
if (process.env.VITEST !== "true") {
    bootstrap().catch((err) => {
        console.error("Fatal startup error:", err);
        process.exit(1);
    });
}

