// src/db/schema/user_statuses.ts

import { pgTable, text } from "drizzle-orm/pg-core";

/**
 * TABLE: user_statuses
 *
 * Lookup table for user account lifecycle state.
 * Seeded via seed script; values are stable.
 */
export const userStatuses = pgTable("user_statuses", {
    statusCode: text("status_code").primaryKey(),
    description: text("description").notNull(),
});
