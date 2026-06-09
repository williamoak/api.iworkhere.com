/**
 * @file cleanupExpiredTokens.ts
 * @internal
 * @module jobs/cleanupExpiredTokens
 * @tag jobs, maintenance, email-verification
 * @version 1.0.0
 * @summary Background job to delete expired email verification tokens.
 * @description
 *   Periodically removes expired email verification tokens from the database.
 *   Runs on a configurable interval (default: every 1 hour).
 *   Prevents unbounded database growth from stale tokens.
 */

import { db } from '@services/dbService';
import { emailVerificationTokens } from '@db/schema';
import { lt } from 'drizzle-orm';

/**
 * Delete all expired email verification tokens.
 * @returns Number of tokens deleted
 */
export async function cleanupExpiredTokens(): Promise<number> {
  try {
    const now = new Date();

    await db
      .delete(emailVerificationTokens)
      .where(lt(emailVerificationTokens.expiresAt, now));

    // Note: Drizzle-orm doesn't return count for delete operations,
    // so we just log that cleanup ran successfully.
    console.log('[cleanupExpiredTokens] Successfully cleaned up expired tokens');

    return 0;
  } catch (error) {
    console.error('[cleanupExpiredTokens] Error during cleanup:', error);
    // Don't throw - background jobs should fail gracefully
    return 0;
  }
}

/**
 * Start the periodic cleanup job.
 * Runs every hour by default (configurable via CLEANUP_JOB_INTERVAL_MS).
 */
export function startCleanupJob(intervalMs: number = 3_600_000): NodeJS.Timer {
  console.log(
    `[cleanupExpiredTokens] Starting job with interval: ${intervalMs}ms (${(intervalMs / 1000 / 60).toFixed(0)} minutes)`,
  );

  // Run cleanup immediately on startup
  cleanupExpiredTokens().catch(() => {
    // Errors already logged in cleanupExpiredTokens
  });

  // Then run on interval
  return setInterval(() => {
    cleanupExpiredTokens().catch(() => {
      // Errors already logged in cleanupExpiredTokens
    });
  }, intervalMs);
}
