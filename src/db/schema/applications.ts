import { pgTable, uuid, text, boolean, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const applications = pgTable(
    'applications',
    {
        id: uuid('id').primaryKey().defaultRandom(),

        appKey: text('app_key').notNull(),

        name: text('name').notNull(),

        description: text('description'),

        isEnabled: boolean('is_enabled').notNull().default(true),

        createdAt: timestamp('created_at', { withTimezone: true })
            .notNull()
            .defaultNow(),

        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .defaultNow(),
    },
    (table) => ({
        appKeyUnique: uniqueIndex('applications_app_key_unique').on(table.appKey),
    }),
);
