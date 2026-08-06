import { logger } from '@helpers/logger';

/**
 * @myDocBlock
 * @file appFactory.ts
 * @internal
 * @module App
 * @tag api, factory, bootstrap
 * @version 1.0.1
 * @author william.r.oak@gmail.com
 * @path src/appFactory.ts
 * @summary Builds the Express application instance.
 * @description
 *   Centralized factory to construct the core Express application.
 *   - Configures CORS for subdomain support.
 *   - Orchestrates global middleware registration.
 *   - Loads routes and static assets.
 *   - Handles environment-specific debug logging.
 * @query {}
 * @requestExample none
 * @response none
 * @requires {
 *   "dependencies": ["express", "cors", "cookie-parser"],
 *   "environment": ["CORS_ALLOWED_ORIGINS", "DEBUG"]
 * }
 */
import express from "express";
import path from "path";
import cookieParser from "cookie-parser";
import cors, { type CorsOptions } from "cors";
import { loadRoutes } from "@loaders/routeLoader";
import adminRoutes from "@src/admin/adminApp";

import { applyGlobalMiddleware } from "@middleware/index";
import { welcomePage } from "@src/admin/client/welcomePage";

import { configGet } from "@helpers/config";

const DEBUG = configGet("DEBUG") === "true";
const AUTH_ME_DEBUG = process.env.AUTH_ME_DEBUG === 'true' || process.env.AUTH_ME_DEBUG === '1';

const allowedOriginRegex = /^https:\/\/([a-z0-9-]+)\.iworkhere\.com$/i;
const explicitAllowedOrigins = new Set(
    (process.env.CORS_ALLOWED_ORIGINS ?? "")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
);

const corsOrigin: NonNullable<CorsOptions["origin"]> = (origin, callback) => {
    if (!origin || origin === "null") {
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
        credentials: true
    }));

    // Body parsing
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(cookieParser());
    applyGlobalMiddleware(app);
    app.use(express.static("public"));
    app.use('/admin/assets', express.static(path.resolve('src/admin/client/assets')));

    if (DEBUG) {
        logger.log(`[DEBUG] AUTH_ME_DEBUG is: ${AUTH_ME_DEBUG}`);
    }
    if (AUTH_ME_DEBUG) {
        // Diagnostic logging for JSON requests (debug only).
        app.use((req, _res, next) => {
            if (req.headers["content-type"]?.includes("application/json")) {
                const forwardedFor = req.headers["x-forwarded-for"];
                const realIp = req.headers["x-real-ip"];
                const requestId = req.headers["x-request-id"];
                const cfRay = req.headers["cf-ray"];
                let bodyText = "<no body>";
                if (req.body !== undefined) {
                    try {
                        bodyText = JSON.stringify(req.body, null, 2);
                    } catch {
                        bodyText = "<unserializable body>";
                    }
                }

                logger.log("----------------------------------------");
                logger.log("--- JSON REQUEST ---");
                logger.log(`${req.method} ${req.originalUrl}`);
                logger.log(`host=${req.hostname}`);
                logger.log(`ip=${req.ip}`);
                if (forwardedFor) {
                    logger.log(`x-forwarded-for=${forwardedFor}`);
                }
                if (realIp) {
                    logger.log(`x-real-ip=${realIp}`);
                }
                if (requestId) {
                    logger.log(`x-request-id=${requestId}`);
                }
                if (cfRay) {
                    logger.log(`cf-ray=${cfRay}`);
                }
                logger.log(`user-agent=${req.get("user-agent") ?? ""}`);
                logger.log(`origin=${req.get("origin") ?? ""}`);
                logger.log(`referer=${req.get("referer") ?? ""}`);
                logger.log(`body=${bodyText}`);
                logger.log("----------------------------------------");
            }
            next();
        });
    }

    // Routes
    app.get('/', (req, res) => {
        logger.log("Root route / hit!");
        res.set('Cache-Control', 'no-store');
        res.send(welcomePage(!!req.auth));
    });

    // Handle verification redirects
    app.get('/verification-success', (_req, res) => {
        res.send(`
            <!DOCTYPE html>
            <html>
            <head><title>Success</title></head>
            <body><h1>Verification Successful!</h1><p>You can now log in.</p><a href="/">Go to Login</a></body>
            </html>
        `);
    });

    app.get('/verification-error', (req, res) => {
        const error = req.query.error || 'Unknown error';
        res.send(`
            <!DOCTYPE html>
            <html>
            <head><title>Error</title></head>
            <body><h1>Verification Failed</h1><p>Error: ${error}</p><a href="/">Go to Login</a></body>
            </html>
        `);
    });
    await loadRoutes(app);
    app.use('/admin', adminRoutes);

    if (DEBUG) {
        logger.dir(app.locals.routeTree?.["/v1/health"], { depth: 10 });
    }

    return app;
}

export async function createTestApp() {
    return createBaseApp();
}
