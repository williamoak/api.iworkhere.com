import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core'
import { users } from './users'

export const emailAuditLogs = pgTable(
  'email_audit_logs',
  {
    id: uuid('id').primaryKey(),

    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' }),

    email: text('email').notNull(),

    emailType: text('email_type').notNull(), // 'verification', 'password_reset', etc.

    status: text('status').notNull(), // 'sent', 'failed'

    errorMessage: text('error_message'),

    createdAt: timestamp('created_at', {
      withTimezone: true,
    }).defaultNow().notNull(),
  }
)
