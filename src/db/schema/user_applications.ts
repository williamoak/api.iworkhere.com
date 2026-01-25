import {
    pgTable,
    uuid,
    text,
    boolean,
    timestamp,
    uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { applications } from './applications';

export const userApplications = pgTable(
    'user_applications',
    {
        id: uuid('id').primaryKey().defaultRandom(),

        userId: uuid('user_id')
            .notNull()
            .references(() => users.id),

        applicationId: uuid('application_id')
            .notNull()
            .references(() => applications.id),

        role: text('role').notNull(),

        isEnabled: boolean('is_enabled').notNull().default(true),

        createdAt: timestamp('created_at', { withTimezone: true })
            .notNull()
            .defaultNow(),

        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .defaultNow(),
    },
    (table) => ({
        userApplicationUnique: uniqueIndex(
            'user_applications_user_application_unique',
        ).on(table.userId, table.applicationId),
    }),
);
