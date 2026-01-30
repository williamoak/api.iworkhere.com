import {
    pgTable,
    uuid,
    text,
    jsonb,
    numeric,
    timestamp,
    uniqueIndex,
    index,
} from "drizzle-orm/pg-core";

/**
 * Canonical configuration table.
 *
 * - UUIDv7 generated in application code
 * - Decimal versioning (###.##)
 * - Supports append OR in-place update semantics
 */
export const configTable = pgTable(
    "config",
    {
        id: uuid("id")
            .primaryKey()
            .notNull(),

        name: text("name")
            .notNull(),

        value: jsonb("value")
            .notNull(),

        version: numeric("version", {
            precision: 5,
            scale: 2,
        })
            .notNull(),

        createdAt: timestamp("created_at", {
            withTimezone: true,
            mode: "date",
        })
            .notNull()
            .defaultNow(),

        updatedAt: timestamp("updated_at", {
            withTimezone: true,
            mode: "date",
        })
            .notNull()
            .defaultNow(),
    },
    (table) => ({
        nameVersionUnique: uniqueIndex(
            "config_name_version_unique"
        ).on(table.name, table.version),

        nameIdx: index("config_name_idx")
            .on(table.name),

        nameVersionIdx: index("config_name_version_idx")
            .on(table.name, table.version),
    })
);
