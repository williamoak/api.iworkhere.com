import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { userStatuses } from "./user_statuses";

export const users = pgTable("users", {
    id: uuid("id").primaryKey(),

    username: text("username").notNull().unique(),
    email: text("email").unique(),

    statusCode: text("status_code")
        .notNull()
        .references(() => userStatuses.statusCode),

    emailVerifiedAt: timestamp("email_verified_at", {
        withTimezone: true,
    }),

    createdAt: timestamp("created_at", {
        withTimezone: true,
    }).defaultNow().notNull(),

    updatedAt: timestamp("updated_at", {
        withTimezone: true,
    }).defaultNow().notNull(),

});
