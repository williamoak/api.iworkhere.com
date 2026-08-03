import { pgTable, uuid, timestamp, text } from 'drizzle-orm/pg-core';

export const visitInfo = pgTable('visit_info', {
    id: uuid('id').primaryKey().defaultRandom(),
    deviceId: uuid('device_id').notNull(),
    touchTime: timestamp('touch_time', { withTimezone: true }).notNull(),
    note: text('note'),
});
