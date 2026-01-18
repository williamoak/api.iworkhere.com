import {
    pgTable,
    uuid,
    text,
    boolean,
    timestamp,
    jsonb,
    pgEnum,
} from "drizzle-orm/pg-core";

/**
 * ENUM: user_status
 */
export const userStatus = pgEnum("user_status", [
    "active",
    "disabled",
    "locked",
    "pending",
]);

/**
 * ENUM: auth_provider
 * (future-facing, not all used immediately)
 */
export const authProvider = pgEnum("auth_provider", [
    "local",        // username/password
    "certificate",  // mTLS client cert
    "oauth",        // OAuth2 / OIDC
    "sso",          // partner SSO
]);

/**
 * TABLE: users
 */
export const users = pgTable("users", {
    userId: uuid("user_id")
        .defaultRandom()
        .primaryKey(),

    // --- Core identity ---
    username: text("username").unique(),

    passwordHash: text("password_hash"), // nullable by design

    status: userStatus("status")
        .notNull()
        .default("active"),

    // --- Auth extensibility ---
    authProvider: authProvider("auth_provider")
        .notNull()
        .default("local"),

    // --- Future identity claims ---
    identityClaims: jsonb("identity_claims"), // cert DNs, OAuth claims, SSO attrs

    // --- Audit / lifecycle ---
    emailVerified: boolean("email_verified").default(false),

    createdAt: timestamp("created_at", { withTimezone: true })
        .defaultNow()
        .notNull(),

    updatedAt: timestamp("updated_at", { withTimezone: true })
        .defaultNow()
        .notNull(),
});
