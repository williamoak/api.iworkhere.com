import { pgSchema, uuid, varchar, text, timestamp, index } from 'drizzle-orm/pg-core';

const joinaunion = pgSchema('joinaunion');

export const widgetAnswers = joinaunion.table('widget_answers', {
    id: uuid('id').primaryKey().defaultRandom(),
    recipient: varchar('recipient', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    message: text('message').notNull(),
    province: varchar('province', { length: 128 }).notNull(),
    industry: varchar('industry', { length: 128 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
    recipientCreatedAtIdx: index('widget_answers_recipient_created_at_idx').on(table.recipient, table.createdAt),
    emailIdx: index('widget_answers_email_idx').on(table.email),
    provinceIndustryIdx: index('widget_answers_province_industry_idx').on(table.province, table.industry),
    createdAtIdx: index('widget_answers_created_at_idx').on(table.createdAt),
}));
