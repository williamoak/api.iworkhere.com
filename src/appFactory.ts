import express from "express";
import cookieParser from "cookie-parser";
import cors, { type CorsOptions } from "cors";
import { loadRoutes } from "@loaders/routeLoader";
import adminRoutes from "@src/admin/adminApp";
import { webAuthMiddleware } from "@middleware/webAuthMiddleware";
import { welcomePage } from "@src/root/index";
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
        credentials: false
    }));

    // Body parsing
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(cookieParser());
    app.use(express.static("public"));

    if (DEBUG) {
        console.log(`[DEBUG] AUTH_ME_DEBUG is: ${AUTH_ME_DEBUG}`);
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

                console.log("----------------------------------------");
                console.log("--- JSON REQUEST ---");
                console.log(`${req.method} ${req.originalUrl}`);
                console.log(`host=${req.hostname}`);
                console.log(`ip=${req.ip}`);
                if (forwardedFor) {
                    console.log(`x-forwarded-for=${forwardedFor}`);
                }
                if (realIp) {
                    console.log(`x-real-ip=${realIp}`);
                }
                if (requestId) {
                    console.log(`x-request-id=${requestId}`);
                }
                if (cfRay) {
                    console.log(`cf-ray=${cfRay}`);
                }
                console.log(`user-agent=${req.get("user-agent") ?? ""}`);
                console.log(`origin=${req.get("origin") ?? ""}`);
                console.log(`referer=${req.get("referer") ?? ""}`);
                console.log(`body=${bodyText}`);
                console.log("----------------------------------------");
            }
            next();
        });
    }

    // Routes
    app.get('/', webAuthMiddleware, (req, res) => {
        console.log("Root route / hit!");
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
        console.dir(app.locals.routeTree["/v1/health"], { depth: 10 });
    }

    return app;
}

export async function createTestApp() {
    return createBaseApp();
}
