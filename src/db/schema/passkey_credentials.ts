import {
    index,
    integer,
    jsonb,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
    uuid,
} from 'drizzle-orm/pg-core';
import { applications } from '@db/schema/applications';
import { users } from '@db/schema/users';

export const passkeyCredentials = pgTable(
    'passkey_credentials',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
        applicationId: uuid('application_id').notNull().references(() => applications.id, { onDelete: 'cascade' }),
        credentialId: text('credential_id').notNull(),
        publicKey: text('public_key').notNull(),
        signCount: integer('sign_count').notNull().default(0),
        transports: jsonb('transports').$type<string[] | null>(),
        displayName: text('display_name'),
        lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
        revokedAt: timestamp('revoked_at', { withTimezone: true }),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => ({
        credentialIdUnique: uniqueIndex('passkey_credentials_credential_id_unique').on(table.credentialId),
        userApplicationIdx: index('passkey_credentials_user_application_idx').on(table.userId, table.applicationId),
        applicationCredentialIdx: index('passkey_credentials_application_credential_idx').on(table.applicationId, table.credentialId),
    }),
);
