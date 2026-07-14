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
        console.log("🧹 Starting database cleanup...");
        await db.transaction(async (tx) => {
            console.log("✅ Clearing email verification tokens...");
            await tx.delete(emailVerificationTokens);
            console.log("✅ Clearing email audit logs...");
            await tx.delete(emailAuditLogs);
            console.log("✅ Clearing local auth data...");
            await tx.delete(userAuthLocal);
            console.log("✅ Clearing password history...");
            await tx.delete(userPasswordHistory);
            console.log("✅ Clearing user applications...");
            await tx.delete(userApplications);
            console.log("✅ Clearing auth tokens...");
            await tx.delete(authTokens);
            console.log("✅ Clearing users...");
            await tx.delete(users);
        });
        console.log("✅ Cleanup successful.");
    } catch (err) {
        console.error("❌ Cleanup failed:", err);
    } finally {
        process.exit(0);
    }
}

cleanup();
