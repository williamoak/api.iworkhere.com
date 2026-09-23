import { pgSchema, uuid, timestamp, text, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from '@db/schema/users';

const joinaunion = pgSchema('joinaunion');

export const userDevices = joinaunion.table('user_devices', {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    deviceId: uuid('device_id').notNull(),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    linkedAt: timestamp('linked_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    linkageSource: text('linkage_source').notNull(),
}, (table) => ({
    accountDeviceIdx: index('user_devices_account_id_device_id_idx').on(table.accountId, table.deviceId),
    accountActiveIdx: index('user_devices_account_id_active_idx').on(table.accountId, table.revokedAt),
    deviceLookupIdx: index('user_devices_device_id_idx').on(table.deviceId),
    activeDeviceUnique: uniqueIndex('user_devices_active_device_unique').on(table.deviceId).where(sql`revoked_at IS NULL`),
}));
