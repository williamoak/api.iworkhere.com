import {
    pgTable,
    uuid,
    text,
    boolean,
    timestamp,
    index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Local authentication credentials (username/password).
 *
 * Exactly one row per user.
 * OAuth-only users will not have a row here.
 */
export const userAuthLocal = pgTable(
    "user_auth_local",
    {
        userId: uuid("user_id")
            .notNull()
            .primaryKey()
            .references(() => users.id, {
                onDelete: "cascade",
            }),

        passwordHash: text("password_hash").notNull(),

        isEnabled: boolean("is_enabled")
            .notNull()
            .default(true),

        createdAt: timestamp("created_at", { withTimezone: true })
            .notNull()
            .defaultNow(),

        updatedAt: timestamp("updated_at", { withTimezone: true })
            .notNull()
            .defaultNow(),
    },
    (table) => ({
        userIdx: index("user_auth_local_user_idx").on(table.userId),
    })
);
