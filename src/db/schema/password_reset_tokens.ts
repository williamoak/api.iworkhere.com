import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core'
import { users } from './users'

export const passwordResetTokens = pgTable(
    'password_reset_tokens',
    {
        id: uuid('id').primaryKey(),

        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),

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
