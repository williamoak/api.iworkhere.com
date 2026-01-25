import bcrypt from "bcryptjs";
import { db } from "@services/dbService";

/**
 * Default local login seed for user 'bill'
 *
 * Seeds:
 *  - users
 *  - applications
 *  - user_applications
 *  - user_auth_local
 *  - user_password_history
 *
 * CockroachDB-safe
 * Fully idempotent
 * Auto-runs on import
 */

const USERNAME = "bill";
const EMAIL = "william.r.oak@gmail.com";
const PASSWORD = "CassandraR0x!";
const APP_KEY = "bill.iworkhere.com";
const APP_NAME = "Bill Web";

/* -------------------------------------------------
 * 1. Ensure user exists (natural key = username)
 * ------------------------------------------------- */

await db.execute(`
    INSERT INTO users (
        id,
        username,
        email,
        status_code,
        created_at,
        updated_at
    )
    SELECT
        gen_random_uuid(),
        '${USERNAME}',
        '${EMAIL}',
        'active',
        now(),
        now()
    WHERE NOT EXISTS (
        SELECT 1
        FROM users
        WHERE username = '${USERNAME}'
    )
`);

/* -------------------------------------------------
 * 2. Resolve user id
 * ------------------------------------------------- */

const userResult = await db.execute<{ id: string }>(`
    SELECT id
    FROM users
    WHERE username = '${USERNAME}'
    LIMIT 1
`);

if (userResult.rows.length === 0) {
    throw new Error("default_login_seed: user 'bill' not found");
}

const userId = userResult.rows[0].id;

/* -------------------------------------------------
 * 3. Ensure application exists (natural key = app_key)
 * ------------------------------------------------- */

await db.execute(`
    UPSERT INTO applications (
        id,
        app_key,
        name,
        description,
        is_enabled,
        created_at,
        updated_at
    )
    VALUES (
        gen_random_uuid(),
        '${APP_KEY}',
        '${APP_NAME}',
        'Primary web application for Bill',
        true,
        now(),
        now()
    )
`);

/* -------------------------------------------------
 * 4. Resolve application id
 * ------------------------------------------------- */

const appResult = await db.execute<{ id: string }>(`
    SELECT id
    FROM applications
    WHERE app_key = '${APP_KEY}'
    LIMIT 1
`);

if (appResult.rows.length === 0) {
    throw new Error("default_login_seed: application not found");
}

const applicationId = appResult.rows[0].id;

/* -------------------------------------------------
 * 5. Grant user access to application
 * ------------------------------------------------- */

await db.execute(`
    UPSERT INTO user_applications (
        id,
        user_id,
        application_id,
        role,
        is_enabled,
        created_at,
        updated_at
    )
    VALUES (
        gen_random_uuid(),
        '${userId}',
        '${applicationId}',
        'owner',
        true,
        now(),
        now()
    )
`);

/* -------------------------------------------------
 * 6. Hash password
 * ------------------------------------------------- */

const passwordHash = await bcrypt.hash(PASSWORD, 12);

/* -------------------------------------------------
 * 7. UPSERT local auth credentials
 * ------------------------------------------------- */

await db.execute(`
    UPSERT INTO user_auth_local (
        user_id,
        password_hash,
        is_enabled,
        created_at,
        updated_at
    )
    VALUES (
        '${userId}',
        '${passwordHash}',
        true,
        now(),
        now()
    )
`);

/* -------------------------------------------------
 * 8. Insert password history (guarded)
 * ------------------------------------------------- */

await db.execute(`
    INSERT INTO user_password_history (
        user_id,
        password_hash,
        created_at
    )
    SELECT
        '${userId}',
        '${passwordHash}',
        now()
    WHERE NOT EXISTS (
        SELECT 1
        FROM user_password_history
        WHERE user_id = '${userId}'
          AND password_hash = '${passwordHash}'
    )
`);

console.log("🌱 Default user + app + auth seeded for 'bill'");
