import {
    pgTable,
    uuid,
    text,
    timestamp,
    index,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export const userPasswordHistory = pgTable(
    'user_password_history',
    {
        id: uuid('id').primaryKey().defaultRandom(),

        userId: uuid('user_id')
            .notNull()
            .references(() => users.id),

        // Previous password hash (never plaintext)
        passwordHash: text('password_hash').notNull(),

        createdAt: timestamp('created_at', { withTimezone: true })
            .notNull()
            .defaultNow(),
    },
    (table) => ({
        // Used when checking recent password reuse
        userIdx: index('user_password_history_user_idx').on(table.userId),
    }),
);
