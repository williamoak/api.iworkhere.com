import {
    pgTable,
    uuid,
    text,
    timestamp,
    index,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export const passwordResetRequests = pgTable(
    'password_reset_requests',
    {
        id: uuid('id').primaryKey().defaultRandom(),

        userId: uuid('user_id')
            .notNull()
            .references(() => users.id),

        // App ↔ API challenge (plaintext, short-lived)
        challenge: text('challenge').notNull(),

        // Hash of expected app response
        responseHash: text('response_hash').notNull(),

        // Set once app proves legitimacy
        verifiedAt: timestamp('verified_at', { withTimezone: true }),

        // Hash of emailed reset token (single-use)
        emailTokenHash: text('email_token_hash'),

        // Absolute expiry for the entire reset flow
        expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

        // Set after password is successfully changed
        usedAt: timestamp('used_at', { withTimezone: true }),

        createdAt: timestamp('created_at', { withTimezone: true })
            .notNull()
            .defaultNow(),
    },
    (table) => ({
        // Hot path when verifying app response
        userActiveIdx: index('password_reset_requests_user_idx').on(table.userId),

        // Used when completing reset via emailed token
        emailTokenIdx: index('password_reset_requests_email_token_idx').on(
            table.emailTokenHash,
        ),
    }),
);
