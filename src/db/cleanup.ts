/**
 * @myDocBlock
 * @file cleanup.ts
 * @internal
 * @module Database
 * @tag db, maintenance
 * @version 1.0.1
 * @author william.r.oak@gmail.com
 * @path src/db/cleanup.ts
 * @summary Utility to wipe database tables.
 * @description
 *   Deletes all users and their registration/login records, including OAuth, passkeys,
 *   password resets, device links, and Redis token caches. Keeps application configuration
 *   and unrelated business data. Stop the API before running to prevent concurrent writes.
 *   Restarting the API clears process-local rate limits. Browser sessions and saved
 *   authenticator passkeys must be removed separately when testing a fresh client.
 *   Intended for test environment resets and local development maintenance.
 * @query {}
 * @requestExample none
 * @response none
 * @requires {
 *   "database": "Access to public schema"
 * }
 */
import { logger } from '@helpers/logger';
import { db, pool } from "@services/dbService";
import { cacheStore } from '@cache/cacheStore';
import { passkeyCredentials } from '@db/schema/passkey_credentials';
import { passwordResetRequests } from '@db/schema/password_reset_requests';
import { passwordResetTokens } from '@db/schema/password_reset_tokens';
import { userAuthOauth } from '@db/schema/user_auth_oauth';
import { userDevices } from '@db/schema/user_devices';
import { emailVerificationTokens } from "@db/schema/email_verification_tokens";
import { emailAuditLogs } from '@db/schema/email_audit_logs';
import { userAuthLocal } from '@db/schema/user_auth_local';
import { userPasswordHistory } from '@db/schema/user_password_history';
import { users } from '@db/schema/users';
import { userApplications } from '@db/schema/user_applications';
import { authTokens } from '@db/schema/auth_tokens';

async function cleanup() {
    let exitCode = 0;
    try {
        logger.log("🧹 Starting database cleanup...");
        await db.transaction(async (tx) => {
            logger.log("✅ Clearing passkey credentials...");
            await tx.delete(passkeyCredentials);
            logger.log("✅ Clearing OAuth identities...");
            await tx.delete(userAuthOauth);
            logger.log("✅ Clearing password reset requests and tokens...");
            await tx.delete(passwordResetRequests);
            await tx.delete(passwordResetTokens);
            logger.log("✅ Clearing user device links...");
            await tx.delete(userDevices);
            logger.log("✅ Clearing email verification tokens...");
            await tx.delete(emailVerificationTokens);
            logger.log("✅ Clearing email audit logs...");
            await tx.delete(emailAuditLogs);
            logger.log("✅ Clearing local auth data...");
            await tx.delete(userAuthLocal);
            logger.log("✅ Clearing password history...");
            await tx.delete(userPasswordHistory);
            logger.log("✅ Clearing user applications...");
            await tx.delete(userApplications);
            logger.log("✅ Clearing auth tokens...");
            await tx.delete(authTokens);
            logger.log("✅ Clearing users...");
            await tx.delete(users);
        });
        // Run even when the tables were already empty, so retries clear stale cache entries.
        // Keep WebAuthn replay markers: deleting them could make used ceremonies reusable.
        logger.log("🧹 Clearing cached auth tokens...");
        await cacheStore.delWhere((key) => key.startsWith('auth:token:'));
        logger.log("✅ Cleanup successful. Restart the API and clear client sessions before testing.");
    } catch (err) {
        exitCode = 1;
        logger.error("❌ Cleanup failed (database changes roll back on database failure; retry if cache cleanup failed):", err);
    } finally {
        try {
            await pool.end();
        } catch (err) {
            exitCode = 1;
            logger.error("❌ Failed to close the database pool:", err);
        }
        process.exit(exitCode);
    }
}

cleanup();

/**
 * @myTestingHints
 * Run npm run userclean only against a disposable test database with the API stopped.
 * Confirm all auth tables and auth:token:* cache entries are empty, then re-register
 * using password, OAuth, and passkeys. Confirm application configuration remains intact.
 * A database failure must roll back all deletes; a cache failure must exit nonzero.
 */
