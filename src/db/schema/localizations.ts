import {
  pgTable,
  uuid,
  text,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

/**
 * Localization strings table.
 *
 * Stores localized replacement strings mapped by slug and language code/tag.
 * - slug: text identifier for the message/string (e.g., 'username', 'welcome_message')
 * - lang: BCP 47 / ISO language code (e.g., 'eng', 'en', 'fr', 'fr-CA')
 * - languageName: Human-readable language name (e.g., 'English', 'French')
 * - text: The translated/replacement text in the specified language
 * - codepage: Character encoding/codepage (e.g., 'UTF-8')
 * - direction: Text direction ('ltr' or 'rtl')
 * - description: Context or translator notes
 */
export const localizations = pgTable(
  'localizations',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    slug: text('slug').notNull(),

    lang: text('lang').notNull(),

    languageName: text('language_name'),

    text: text('text').notNull(),

    codepage: text('codepage').default('UTF-8'),

    direction: text('direction').default('ltr'),

    description: text('description'),

    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp('updated_at', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    slugLangUnique: uniqueIndex('localizations_slug_lang_unique').on(
      table.slug,
      table.lang,
    ),
    slugIdx: index('localizations_slug_idx').on(table.slug),
    langIdx: index('localizations_lang_idx').on(table.lang),
    langSlugIdx: index('localizations_lang_slug_idx').on(
      table.lang,
      table.slug,
    ),
  }),
);

export type Localization = typeof localizations.$inferSelect;
export type NewLocalization = typeof localizations.$inferInsert;
