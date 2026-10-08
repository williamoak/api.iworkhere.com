import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core'
import { users } from "@db/schema/users"
import { applications } from "@db/schema/applications"

export const passwordResetTokens = pgTable(
    'password_reset_tokens',
    {
        id: uuid('id').primaryKey(),

        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),

        applicationId: uuid('application_id')
            .references(() => applications.id, { onDelete: 'set null' }),

        tokenHash: text('token_hash').notNull().unique(),

        expiresAt: timestamp('expires_at', {
            withTimezone: true,
        }),

        createdAt: timestamp('created_at', {
            withTimezone: true,
        })
            .defaultNow()
            .notNull(),
    }
)
