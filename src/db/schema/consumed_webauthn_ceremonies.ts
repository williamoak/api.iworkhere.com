import { index, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Replay markers for WebAuthn ceremony tokens. A row's presence means the
 * ceremony identified by `jti` has already been consumed. Rows are removed by
 * the cleanup job once they are past their expiry, so this table stays small.
 *
 * This is the authoritative replay record. Redis must not be used for it.
 */
export const consumedWebauthnCeremonies = pgTable(
    'consumed_webauthn_ceremonies',
    {
        jti: uuid('jti').primaryKey(),
        expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => ({
        expiresAtIdx: index('consumed_webauthn_ceremonies_expires_at_idx').on(table.expiresAt),
    }),
);
