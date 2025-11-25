/**
 * @file validate.ts
 * @summary Temporary no-op validator replacing Zod-based validation.
 * @description
 *   This module provides a stub validation layer so that routeLoader.ts
 *   continues to function after removing Zod. Once Drizzle schema validation
 *   is introduced, this file will be upgraded.
 */

import { Request, Response, NextFunction } from "express";

// Shape of the expected return value
interface Validator {
    request: (req: Request, res: Response, next: NextFunction) => void;
    response: <T>(data: T) => T;
}

/**
 * Create a no-op validator that ignores the schema.
 *
 * @param schema - placeholder for future Drizzle schemas
 */
export function makeValidator(_schema: any): Validator {

    return {
        /**
         * Request validator — currently a no-op.
         */
        request(req: Request, _res: Response, next: NextFunction) {
            // No validation — just continue
            next();
        },

        /**
         * Response validator — currently returns the data unchanged.
         */
        response<T>(data: T): T {
            return data;
        }
    };
}
