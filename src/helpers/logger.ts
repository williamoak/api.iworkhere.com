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
    log: (message?: any, forceLog: boolean = false, ...optionalParams: any[]) => {
        const isForceLogBoolean = typeof forceLog === 'boolean';
        const shouldForce = isForceLogBoolean ? forceLog : false;
        if (DEBUG || shouldForce) {
            if (isForceLogBoolean) {
                if (optionalParams.length > 0) {
                    console.log(message, ...optionalParams);
                } else if (message !== undefined) {
                    console.log(message);
                } else {
                    console.log();
                }
            } else {
                console.log(message, forceLog, ...optionalParams);
            }
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
