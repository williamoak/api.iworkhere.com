import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * OAuth authentication identities.
 *
 * One row per external provider account linked to a user.
 * For Google, providerAccountId should be the stable Google `sub` claim.
 */
export const userAuthOauth = pgTable(
  "user_auth_oauth",
  {
    id: uuid("id").primaryKey(),

    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, {
        onDelete: "cascade",
      }),

    provider: text("provider").notNull(),

    providerAccountId: text("provider_account_id").notNull(),

    email: text("email"),

    emailVerified: boolean("email_verified")
      .notNull()
      .default(false),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    providerAccountIdx: uniqueIndex(
      "user_auth_oauth_provider_account_idx"
    ).on(table.provider, table.providerAccountId),

    userProviderIdx: uniqueIndex("user_auth_oauth_user_provider_idx").on(
      table.userId,
      table.provider
    ),

    userIdx: index("user_auth_oauth_user_idx").on(table.userId),
  })
);
