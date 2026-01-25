/**
 * @myDocBlock v2.1
 * @file /src/helpers/config.ts
 * @internal
 * @module Config
 * @tag helpers
 * @version 1.0.2
 * @path none
 * @summary Centralized environment configuration loader and accessor.
 * @description
 *   Loads and merges .env files using layered precedence:
 *     1. .env
 *     2. .env.local
 *     3. .env.{NODE_ENV}
 *     4. .env.{NODE_ENV}.local
 *
 *   Later files override earlier ones. Finally, process.env overrides
 *   everything. This file MUST be imported before any modules that rely on env.
 * @requestExample none
 * @response none
 * @requires none
 */

import fs from "fs";
import path from "path";
import dotenv from "dotenv";


/**
 * Get required numeric variable
 */
export function configGetNumber(
    key: string,
    options?: {
        defaultValue?: number;
        min?: number;
        max?: number;
    }
): number {
    const raw = config[key];

    if (raw === undefined || raw.trim() === "") {
        if (options?.defaultValue !== undefined) {
            return options.defaultValue;
        }
        throw new Error(`Missing required numeric configuration variable: ${key}`);
    }

    const value = Number(raw);

    if (!Number.isFinite(value)) {
        throw new Error(`Invalid numeric value for configuration variable: ${key}`);
    }

    if (options?.min !== undefined && value < options.min) {
        throw new Error(`Configuration variable ${key} must be >= ${options.min}`);
    }

    if (options?.max !== undefined && value > options.max) {
        throw new Error(`Configuration variable ${key} must be <= ${options.max}`);
    }

    return value;
}

/**
 * Determine environment (default "development")
 */
const env = process.env.NODE_ENV ?? "development";

/**
 * Env file precedence order
 */
const envFiles = [
    ".env",
    ".env.local",
    `.env.${env}`,
    `.env.${env}.local`
];

/**
 * Project root
 */
const projectRoot = path.resolve(process.cwd());

/**
 * Merged values
 */
let combined: Record<string, string | undefined> = {};

/**
 * Load each env file (if it exists)
 */
for (const file of envFiles) {
    const fullPath = path.join(projectRoot, file);

    if (fs.existsSync(fullPath)) {
        const result = dotenv.config({ path: fullPath });

        if (result.parsed) {
            combined = { ...combined, ...result.parsed };
        }
    }
}

/**
 * Merge actual runtime process.env last
 */
combined = { ...combined, ...process.env };

/**
 * Export configuration object
 */
export const config = combined;

/**
 * Get required variable
 */
export function configGet(key: string): string {
    const value = config[key];

    if (value === undefined || value.trim() === "") {
        throw new Error(`Missing required configuration variable: ${key}`);
    }

    return value;
}
