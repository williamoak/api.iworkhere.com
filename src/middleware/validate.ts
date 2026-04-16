/**
 * @myDocBlock v3.1
 * @file validate.ts
 * @internal
 * @module middleware/validate
 * @tag api, validation, middleware
 * @version 3.1.0
 * @author placeholder@example.com
 * @path src/middleware/validate.ts
 * @summary Global request hardening + per-route Zod validation.
 *
 * @description
 *   Provides a centralized validation layer for the RouteLoader middleware chain.
 *
 *   This middleware is intentionally two-layered:
 *     1) Global checks (schema-agnostic)
 *     2) Per-route checks (schema-driven via Zod)
 *
 *   IMPORTANT:
 *     - Framework-owned request properties (req.query, req.body, req.params)
 *       are NEVER mutated.
 *     - All validated data is attached to req.validated.
 */

import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

export type ValidationSchemas = {
  body?: z.ZodSchema;
  query?: z.ZodSchema;
  params?: z.ZodSchema;
  response?: z.ZodSchema;
};

export interface ValidatedRequestData {
  query?: unknown;
  body?: unknown;
  params?: unknown;
}

declare module 'express' {
  interface Request {
    validated?: ValidatedRequestData;
  }
}

interface Validator {
  request: (req: Request, res: Response, next: NextFunction) => void;
  response: <T>(data: T) => T;
}

/* ------------------------------------------------------------------ */
/* Global checks / hardening                                          */
/* ------------------------------------------------------------------ */

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function hasPrototypePollutionKeys(value: unknown): boolean {
  const forbidden = new Set(['__proto__', 'prototype', 'constructor']);

  const visit = (v: unknown): boolean => {
    if (!v || typeof v !== 'object') return false;

    if (Array.isArray(v)) {
      for (const item of v) if (visit(item)) return true;
      return false;
    }

    for (const key of Object.keys(v as Record<string, unknown>)) {
      if (forbidden.has(key)) return true;
      if (visit((v as Record<string, unknown>)[key])) return true;
    }
    return false;
  };

  return visit(value);
}

function wantsJsonBody(req: Request): boolean {
  return BODY_METHODS.has(req.method.toUpperCase());
}

function contentTypeLooksJson(req: Request): boolean {
  const ct = (req.headers['content-type'] ?? '').toString().toLowerCase();
  return ct.includes('application/json') || ct.includes('+json');
}

function sendInvalidRequest(
  res: Response,
  payload: { message: string; details?: unknown },
) {
  return res.status(400).json({
    error: 'INVALID_REQUEST',
    message: payload.message,
    details: payload.details,
  });
}

/* ------------------------------------------------------------------ */
/* Factory                                                            */
/* ------------------------------------------------------------------ */

export function makeValidator(schemas: ValidationSchemas = {}): Validator {
  return {
    request(req: Request, res: Response, next: NextFunction) {
      /* ------------------------------------------------------
       * Global checks (schema-agnostic)
       * ------------------------------------------------------ */

      if (wantsJsonBody(req)) {
        const hasSomeBody =
          req.body !== undefined &&
          req.body !== null &&
          !(typeof req.body === 'string' && req.body.trim() === '');

        if (hasSomeBody && !contentTypeLooksJson(req)) {
          return res.status(415).json({
            error: 'UNSUPPORTED_MEDIA_TYPE',
            message: 'Content-Type must be application/json',
          });
        }
      }

      if (req.body !== undefined && req.body !== null) {
        if (!isPlainObject(req.body)) {
          return sendInvalidRequest(res, {
            message: 'Request body must be a JSON object',
          });
        }

        if (hasPrototypePollutionKeys(req.body)) {
          return sendInvalidRequest(res, {
            message: 'Request body contains forbidden keys',
          });
        }
      }

      if (req.query && hasPrototypePollutionKeys(req.query)) {
        return sendInvalidRequest(res, {
          message: 'Query string contains forbidden keys',
        });
      }

      /* ------------------------------------------------------
       * Per-route schema validation
       * ------------------------------------------------------ */

      req.validated = req.validated ?? {};

      if (schemas.params) {
        const parsed = schemas.params.safeParse(req.params);
        if (!parsed.success) {
          return sendInvalidRequest(res, {
            message: 'Invalid path parameters',
            details: parsed.error.issues,
          });
        }
        req.validated.params = parsed.data;
      }

      if (schemas.query) {
        const parsed = schemas.query.safeParse(req.query);
        if (!parsed.success) {
          return sendInvalidRequest(res, {
            message: 'Invalid query parameters',
            details: parsed.error.issues,
          });
        }
        req.validated.query = parsed.data;
      }

      if (schemas.body) {
        const parsed = schemas.body.safeParse(req.body ?? {});
        if (!parsed.success) {
          return sendInvalidRequest(res, {
            message: 'Invalid request body',
            details: parsed.error.issues,
          });
        }
        req.validated.body = parsed.data;
      }

      return next();
    },

    response<T>(data: T): T {
      if (!schemas.response) return data;

      const parsed = schemas.response.safeParse(data);
      if (!parsed.success) {
        const err = new Error('Response validation failed');
        (err as Error & { details?: unknown }).details = parsed.error.issues;
        throw err;
      }

      return parsed.data as T;
    },
  };
}
