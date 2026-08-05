import { logger } from '@helpers/logger';
/**
 * @myDocBlock
 * @file logger.ts
 * @internal
 * @module Helpers
 * @tag logger, debug
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path src/helpers/logger.ts
 * @summary Centralized debug-aware logging utility.
 * @description
 *   Provides a unified logging interface that respects the global DEBUG
 *   environment variable. All logs are gated behind this flag.
 * @requires {
 *   "dependencies": ["@helpers/config"]
 * }
 */
import { configGet } from '@helpers/config';

const DEBUG = configGet('DEBUG') === 'true';

export const logger = {
    log: (...args: any[]) => {
        if (DEBUG) {
            console.log(...args);
        }
    },
    error: (...args: any[]) => {
        console.error(...args);
    },
    warn: (...args: any[]) => {
        console.warn(...args);
    },
    dir: (...args: any[]) => {
        if (DEBUG) {
            console.dir(...args);
        }
    }
};
