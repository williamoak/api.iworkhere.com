/**
 * @myDocBlock
 * @file cleanupExpiredTokens.ts
 * @internal
 * @module jobs
 * @tag jobs, maintenance
 * @version 1.2.0
 * @author william.r.oak@gmail.com
 * @path src/jobs/cleanupExpiredTokens.ts
 * @summary Background job to delete expired email verification tokens and consumed WebAuthn ceremony records.
 * @description
 *   Periodically removes expired email verification tokens and consumed WebAuthn
 *   ceremony records (past expiry plus a clock-skew grace period) from CockroachDB.
 *   Runs immediately on startup and subsequently at a configurable interval
 *   (default: every 1 hour).
 *
 *   Uses an atomic, idempotent SQL DELETE operation so multiple Kubernetes
 *   API replicas can execute cleanup concurrently without requiring
 *   distributed locks or leader election.
 *
 *   Prevents overlapping cleanup executions within a single Node.js process.
 *   Logs actual deletion counts and propagates database errors to callers.
 *
 *   Database transaction conflicts may occur during concurrent execution.
 *   Failed cleanup operations are logged and can be retried on a future run.
 *
 *   Rows with NULL expires_at values are not deleted.
 * @requestExample none
 * @response none
 * @requires {
 *   "database": "emailVerificationTokens and consumed_webauthn_ceremonies tables",
 *   "services": ["dbService"],
 *   "dependencies": ["drizzle-orm"],
 *   "environment": {
 *     "CLEANUP_JOB_INTERVAL_MS": "Optional cleanup interval in milliseconds; default 3600000"
 *   }
 * }
 */

import { logger } from '@helpers/logger';
import { db } from '@services/dbService';
import { consumedWebauthnCeremonies, emailVerificationTokens } from '@db/schema';
import { lt, sql } from 'drizzle-orm';

/**
 * Consumed-ceremony records are kept this long after their ceremony expires.
 * A replay is rejected by the expiry check on whichever pod receives it, so a
 * record must outlive that check on a pod whose clock lags the issuing pod.
 * Five minutes is well above normal NTP drift.
 */
const CEREMONY_CLOCK_SKEW_GRACE_MS = 5 * 60_000;

/**
 * Delete all expired email verification tokens.
 *
 * The deletion operation is idempotent. Running it multiple times produces
 * the same final database state for a fixed set of expired tokens.
 *
 * Multiple Kubernetes pods may execute this function concurrently.
 * CockroachDB provides transactional consistency, although concurrent
 * operations can occasionally encounter retryable transaction errors.
 *
 * Tokens with NULL expiresAt values are preserved.
 *
 * @returns The number of deleted email verification tokens.
 * @throws Error if the database operation fails.
 */
export async function cleanupExpiredTokens(): Promise<number> {
  const now = new Date();

  try {
    const deletedTokens = await db
      .delete(emailVerificationTokens)
      .where(lt(emailVerificationTokens.expiresAt, now))
      .returning({
        id: emailVerificationTokens.id,
      });

    const deletedCount = deletedTokens.length;

    logger.log(
      `[cleanupExpiredTokens] Successfully deleted ${deletedCount} expired token(s)`,
    );

    return deletedCount;
  } catch (error: unknown) {
    logger.error('[cleanupExpiredTokens] Error during cleanup:', error);

    throw error;
  }
}

/**
 * Delete consumed WebAuthn ceremony records whose ceremony expired more than
 * CEREMONY_CLOCK_SKEW_GRACE_MS ago.
 *
 * Deleting a record only after the grace period keeps replay protection intact
 * across clock skew between API pods. The delete is idempotent, so several
 * pods can run it at once.
 *
 * @returns The number of deleted consumed-ceremony records.
 * @throws Error if the database operation fails.
 */
export async function cleanupExpiredCeremonies(
  database: Pick<typeof db, 'delete'> = db,
): Promise<number> {
  try {
    const deletedCeremonies = await database
      .delete(consumedWebauthnCeremonies)
      .where(
        lt(
          consumedWebauthnCeremonies.expiresAt,
          // Evaluated by CockroachDB, so every pod uses the same clock.
          sql`now() - (CAST(${CEREMONY_CLOCK_SKEW_GRACE_MS / 1000} AS INT8) * INTERVAL '1 second')`,
        ),
      )
      .returning({
        jti: consumedWebauthnCeremonies.jti,
      });

    const deletedCount = deletedCeremonies.length;

    logger.log(
      `[cleanupExpiredCeremonies] Successfully deleted ${deletedCount} expired consumed ceremony record(s)`,
    );

    return deletedCount;
  } catch (error: unknown) {
    logger.error('[cleanupExpiredCeremonies] Error during cleanup:', error);

    throw error;
  }
}

/**
 * Start the periodic cleanup job.
 *
 * Runs cleanup immediately on startup and repeats at the specified interval.
 *
 * A local execution guard prevents overlapping cleanup operations within
 * this Node.js process. The guard is intentionally process-local; other
 * Kubernetes API replicas may execute the same idempotent cleanup operation.
 *
 * Database errors are logged by cleanupExpiredTokens() and handled by the
 * scheduler so they do not terminate the interval.
 *
 * @param intervalMs Cleanup interval in milliseconds.
 * @returns NodeJS.Timeout handle for stopping the scheduled interval.
 * @throws RangeError if intervalMs is not a valid interval.
 */
export function startCleanupJob(
  intervalMs: number = 3_600_000,
): NodeJS.Timeout {
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 1_000) {
    throw new RangeError(
      '[cleanupExpiredTokens] Interval must be an integer of at least 1000 milliseconds',
    );
  }

  let isRunning = false;

  /**
   * Execute cleanup only if another execution is not already active
   * within this Node.js process.
   */
  const runCleanup = async (): Promise<void> => {
    if (isRunning) {
      logger.log(
        '[cleanupExpiredTokens] Previous cleanup still running; skipping scheduled execution',
      );

      return;
    }

    isRunning = true;

    try {
      // Run both even if one fails. Each function logs its own errors, and the
      // scheduler stays alive so a subsequent interval can retry.
      await Promise.allSettled([cleanupExpiredTokens(), cleanupExpiredCeremonies()]);
    } finally {
      isRunning = false;
    }
  };

  logger.log(
    `[cleanupExpiredTokens] Starting job with interval: ${intervalMs}ms (${(intervalMs / 1000 / 60).toFixed(0)} minutes)`,
  );

  // Execute cleanup immediately on startup.
  void runCleanup();

  // Continue executing cleanup at the configured interval.
  const timer = setInterval(() => {
    void runCleanup();
  }, intervalMs);

  return timer;
}
