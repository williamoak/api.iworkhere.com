import {
    pgTable,
    uuid,
    text,
    timestamp,
    index,
    AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { applications } from './applications';

export const authTokens = pgTable(
    'auth_tokens',
    {
        id: uuid('id').primaryKey().defaultRandom(),

        userId: uuid('user_id')
            .notNull()
            .references(() => users.id),

        applicationId: uuid('application_id')
            .notNull()
            .references(() => applications.id),

        tokenType: text('token_type').notNull(), // 'access' | 'refresh' (data, not enum)

        tokenHash: text('token_hash').notNull(),

        expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

        revokedAt: timestamp('revoked_at', { withTimezone: true }),

        replacedByTokenId: uuid('replaced_by_token_id')
            .references((): AnyPgColumn => authTokens.id),

        createdAt: timestamp('created_at', { withTimezone: true })
            .notNull()
            .defaultNow(),
    },
    (table) => ({
        // Hot path for refresh validation
        tokenHashIdx: index('auth_tokens_token_hash_idx').on(table.tokenHash),

        // Useful for cleanup & audits
        userAppIdx: index('auth_tokens_user_app_idx').on(
            table.userId,
            table.applicationId,
        ),
    }),
);
