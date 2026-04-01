import express from "express";
import cors, { type CorsOptions } from "cors";
import { loadRoutes } from "@loaders/routeLoader";
import { configGet } from "@helpers/config";

const DEBUG = configGet("DEBUG") === "true";

const allowedOriginRegex = /^https:\/\/([a-z0-9-]+)\.iworkhere\.com$/i;
const explicitAllowedOrigins = new Set(
    (process.env.CORS_ALLOWED_ORIGINS ?? "")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
);

const corsOrigin: NonNullable<CorsOptions["origin"]> = (origin, callback) => {
    if (!origin) {
        callback(null, true);
        return;
    }

    if (explicitAllowedOrigins.has(origin)) {
        callback(null, true);
        return;
    }

    if (allowedOriginRegex.test(origin)) {
        callback(null, true);
        return;
    }

    callback(new Error(`CORS blocked for origin: ${origin}`), false);
};

/**
 * Builds the core Express app with middleware and routes.
 * Shared by server.ts (production) and tests.
 */
export async function createBaseApp() {
    const app = express();
    app.set("trust proxy", true);

    // CORS must come first
    app.use(cors({
        origin: corsOrigin,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
        credentials: false
    }));

    if (DEBUG) {
        // Diagnostic logging for JSON requests (debug only).
        app.use((req, _res, next) => {
            if (req.headers['content-type']?.includes('application/json')) {
                console.log('----------------------------------------');
                console.log('--- JSON REQUEST ---');
                console.log(req.method, req.url);
                console.log('----------------------------------------');
            }
            next();
        });
    }

    // Body parsing
    app.use(express.json());

    // Routes
    await loadRoutes(app);

    if (DEBUG) {
        console.dir(app.locals.routeTree["/v1/health"], { depth: 10 });
    }

    return app;
}

export async function createTestApp() {
    return createBaseApp();
}
