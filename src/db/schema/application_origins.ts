import {
    pgTable,
    uuid,
    text,
    boolean,
    timestamp,
    uniqueIndex,
} from 'drizzle-orm/pg-core';
import { applications } from './applications';

export const applicationOrigins = pgTable(
    'application_origins',
    {
        id: uuid('id').primaryKey().defaultRandom(),

        applicationId: uuid('application_id')
            .notNull()
            .references(() => applications.id),

        origin: text('origin').notNull(),

        type: text('type').notNull(),

        isEnabled: boolean('is_enabled').notNull().default(true),

        createdAt: timestamp('created_at', { withTimezone: true })
            .notNull()
            .defaultNow(),

        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .defaultNow(),
    },
    (table) => ({
        applicationOriginUnique: uniqueIndex(
            'application_origins_app_origin_type_unique',
        ).on(table.applicationId, table.origin, table.type),
    }),
);
