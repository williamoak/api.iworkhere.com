import { logger } from '@helpers/logger';

/**
 * @myDocBlock
 * @file start.ts
 * @internal
 * @module Startup
 * @tag api
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path src/start.ts
 * @summary Entry point to bootstrap the API server.
 * @description
 *   Loads environment variables and executes the server bootstrap process,
 *   ensuring fatal startup errors are caught.
 * @requestExample none
 * @response none
 * @requires {
 *   "dependencies": ["src/server.ts"]
 * }
 */
/* loading the main program here, so I can mock certain files easier */
import { bootstrap } from "@src/server";

bootstrap().catch(err => {
    logger.error("Fatal startup error:", err);
    process.exit(1);
});
