import { logger } from '@helpers/logger';

/**
 * @myDocBlock
 * @file cleanup.ts
 * @internal
 * @module Database
 * @tag db, maintenance
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path src/db/cleanup.ts
 * @summary Utility to wipe database tables.
 * @description
 *   Performs a cascading cleanup of all user-related data tables in the public schema.
 *   Intended for test environment resets and local development maintenance.
 * @query {}
 * @requestExample none
 * @response none
 * @requires {
 *   "database": "Access to public schema"
 * }
 */
;
import { db } from "@services/dbService";
import { emailVerificationTokens } from "@db/schema/email_verification_tokens";
import { emailAuditLogs } from '@db/schema/email_audit_logs';
import { userAuthLocal } from '@db/schema/user_auth_local';
import { userPasswordHistory } from '@db/schema/user_password_history';
import { users } from '@db/schema/users';
import { userApplications } from '@db/schema/user_applications';
import { authTokens } from '@db/schema/auth_tokens';

async function cleanup() {
    try {
        logger.log("🧹 Starting database cleanup...");
        await db.transaction(async (tx) => {
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
        logger.log("✅ Cleanup successful.");
    } catch (err) {
        logger.error("❌ Cleanup failed:", err);
    } finally {
        process.exit(0);
    }
}

cleanup();
