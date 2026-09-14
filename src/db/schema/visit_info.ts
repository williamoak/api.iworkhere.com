import { pgTable, uuid, timestamp, text, doublePrecision, index } from 'drizzle-orm/pg-core';

export const visitInfo = pgTable('visit_info', {
    id: uuid('id').primaryKey().defaultRandom(),
    deviceId: uuid('device_id').notNull(),
    userId: uuid('user_id'),
    requestMethod: text('request_method').notNull(),
    touchTime: timestamp('touch_time', { withTimezone: true }).notNull(),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    note: text('note'),
}, (table) => {
    return {
        deviceIdNoteIdx: index('device_id_note_idx').on(table.deviceId, table.note),
        deviceIdTouchTimeIdx: index('device_id_touch_time_idx').on(table.deviceId, table.touchTime),
        userIdIdx: index('user_id_idx').on(table.userId),
        userIdRequestMethodIdx: index('user_id_request_method_idx').on(table.userId, table.requestMethod),
    };
});
