/**
 * @myDocBlock
 * @file backoffMiddleware.ts
 * @internal
 * @module Middleware
 * @tag api
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path src/middleware/backoffMiddleware.ts
 * @summary Concurrency-limited admission middleware with exponential backoff and bounded wait.
 * @description
 *   This middleware enforces a per-route, per-method maximum number of concurrent
 *   in-flight requests while allowing excess requests to wait using an exponential
 *   backoff strategy with jitter.
 *
 *   When the number of active requests for a given route key
 *   (HTTP method + Express route path) reaches the configured maximum, additional
 *   requests are delayed and retried internally until either:
 *
 *     - a concurrency slot becomes available, or
 *     - the total accumulated wait time exceeds the configured maximum wait window
 *
 *   If the maximum wait time is exceeded, the request is rejected with HTTP 429
 *   and a Retry-After response header.
 *
 *   This middleware is intended for protecting expensive internal routes
 *   (e.g. database-heavy or CPU-bound endpoints) by smoothing burst traffic
 *   without immediately failing clients.
 *
 *   The concurrency counters are process-local and reset on process restart.
 *   This middleware does not provide cross-process or distributed coordination.
 *
 * @query
 *   {}
 *
 * @requestExample
 *   {
 *     "method": "GET",
 *     "path": "/v1/reports/summary",
 *     "headers": {
 *       "accept": "application/json"
 *     }
 *   }
 *
 * @response
 *   {
 *     "success": {
 *       "status": 200,
 *       "description": "Request admitted after immediate or delayed concurrency availability"
 *     },
 *     "failure": {
 *       "status": 429,
 *       "headers": {
 *         "Retry-After": "1"
 *       },
 *       "body": {
 *         "error": "TOO_MANY_REQUESTS",
 *         "message": "Server is busy, please retry shortly"
 *       }
 *     }
 *   }
 *
 * @requires
 *   - express
 */

import type { Request, Response, NextFunction } from "express";

type Counter = {
    active: number;
};

const counters = new Map<string, Counter>();

function keyFor(req: Request): string {
    return `${req.method}:${req.route?.path ?? req.path}`;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function backoffDelay(attempt: number): number {
    const base = 50;          // 50ms
    const max = 1000;         // cap per-delay
    const exp = Math.min(max, base * Math.pow(2, attempt));
    const jitter = Math.random() * exp * 0.3; // 0–30% jitter
    return exp + jitter;
}

export function backoffMiddleware(
    maxConcurrent: number,
    maxWaitMs = 3000
) {
    return async (req: Request, res: Response, next: NextFunction) => {
        const key = keyFor(req);

        let counter = counters.get(key);
        if (!counter) {
            counter = { active: 0 };
            counters.set(key, counter);
        }

        let attempt = 0;
        let waited = 0;

        while (counter.active >= maxConcurrent) {
            const delay = backoffDelay(attempt++);
            waited += delay;

            if (waited > maxWaitMs) {
                res.setHeader("Retry-After", "1");
                return res.status(429).json({
                    error: "TOO_MANY_REQUESTS",
                    message: "Server is busy, please retry shortly"
                });
            }

            await sleep(delay);
        }

        counter.active++;

        const done = () => {
            counter!.active = Math.max(0, counter!.active - 1);
        };

        res.once("finish", done);
        res.once("close", done);

        return next();
    };
}
