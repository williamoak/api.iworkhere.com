/**
 * @myDocBlock
 * @file throttleMiddleware.ts
 * @internal
 * @module Middleware
 * @tag api
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path src/middleware/throttleMiddleware.ts
 * @summary Fail-fast concurrency throttle enforcing a maximum number of in-flight requests per route.
 * @description
 *   This middleware enforces a strict upper bound on the number of concurrent
 *   in-flight requests per route key (HTTP method + Express route path).
 *
 *   When the number of active requests reaches the configured maximum, additional
 *   requests are rejected immediately with HTTP 429 (Too Many Requests).
 *   No waiting, queuing, or retry logic is performed internally.
 *
 *   This middleware is intended for protecting public-facing or latency-sensitive
 *   endpoints where predictable response behavior is preferred over delayed
 *   admission (e.g. burst protection, API hard limits).
 *
 *   Concurrency counters are tracked in process-local memory and are decremented
 *   automatically when the response finishes or the client connection closes.
 *   This middleware does not provide distributed or cross-process coordination.
 *
 * @query
 *   {}
 *
 * @requestExample
 *   {
 *     "method": "POST",
 *     "path": "/v1/orders",
 *     "headers": {
 *       "content-type": "application/json"
 *     }
 *   }
 *
 * @response
 *   {
 *     "success": {
 *       "status": 200,
 *       "description": "Request admitted under concurrency limit"
 *     },
 *     "failure": {
 *       "status": 429,
 *       "headers": {
 *         "Retry-After": "1"
 *       },
 *       "body": {
 *         "error": "TOO_MANY_REQUESTS",
 *         "message": "Too many concurrent requests"
 *       }
 *     }
 *   }
 *
 * @requires
 *   - express
 */

import type { Request, Response, NextFunction } from 'express';

type Counter = {
  active: number;
};

const counters = new Map<string, Counter>();

function keyFor(req: Request): string {
  return `${req.method}:${req.route?.path ?? req.path}`;
}

export function throttleMiddleware(maxConcurrent = 10) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = keyFor(req);

    let counter = counters.get(key);
    if (!counter) {
      counter = { active: 0 };
      counters.set(key, counter);
    }

    if (counter.active >= maxConcurrent) {
      res.setHeader('Retry-After', '1');
      return res.status(429).json({
        error: 'TOO_MANY_REQUESTS',
        message: 'Too many concurrent requests',
      });
    }

    counter.active++;

    const done = () => {
      counter!.active = Math.max(0, counter!.active - 1);
    };

    res.once('finish', done);
    res.once('close', done);

    return next();
  };
}
