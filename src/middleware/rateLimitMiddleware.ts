/**
 * @myDocBlock v2.3
 * @file rateLimitMiddleware.ts
 * @internal
 * @module Middleware
 * @tag api, rate-limit
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path src/middleware/rateLimitMiddleware.ts
 * @summary Time-window based rate limiting middleware.
 * @description
 *   Enforces a maximum number of requests within a rolling time window.
 *   Intended for security-sensitive endpoints such as authentication,
 *   password reset, and email verification flows.
 *
 *   This middleware is identity-aware via a configurable key function.
 *   Counters are stored in process-local memory and reset automatically
 *   as windows expire.
 *
 *   This middleware is stateless across processes and should be backed
 *   by a distributed store (e.g. Redis) if horizontal scaling is required.
 *
 * @query
 *   {}
 *
 * @requires
 *   - express
 */

import type { Request, Response, NextFunction } from 'express';

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RateLimitOptions = {
  /**
   * Function used to derive a rate-limit key from the request.
   * Example: IP address, email, identifier, or combination.
   */
  key: (req: Request) => string;

  /**
   * Maximum number of allowed requests within the window.
   */
  max: number;

  /**
   * Window duration in milliseconds.
   */
  windowMs: number;

  /**
   * Optional error response override.
   */
  error?: {
    status?: number;
    code?: string;
    message?: string;
  };
};

/**
 * In-memory store (process-local).
 */
const store = new Map<string, RateLimitEntry>();

export function rateLimitMiddleware(options: RateLimitOptions) {
  const { key, max, windowMs, error = {} } = options;

  const status = error.status ?? 429;
  const code = error.code ?? 'TOO_MANY_REQUESTS';
  const message = error.message ?? 'Too many requests, please retry later';

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const limitKey = key(req);

    if (!limitKey) {
      // If no key can be derived, fail open
      return next();
    }

    let entry = store.get(limitKey);

    if (!entry || entry.resetAt <= now) {
      entry = {
        count: 0,
        resetAt: now + windowMs,
      };
      store.set(limitKey, entry);
    }

    entry.count++;

    if (entry.count > max) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((entry.resetAt - now) / 1000),
      );

      res.setHeader('Retry-After', String(retryAfterSeconds));

      return res.status(status).json({
        error: code,
        message,
      });
    }

    return next();
  };
}

export function __resetRateLimitStore() {
  store.clear();
}
