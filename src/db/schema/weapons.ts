import {
    pgTable,
    uuid,
    text,
    jsonb,
} from "drizzle-orm/pg-core";

/**
 * TABLE: warframe_weapons
 *
 * Legacy domain table.
 * Schema mirrors existing DB exactly.
 */
export const weapons = pgTable("warframe_weapons", {
    weaponId: uuid("weapon_id").primaryKey(),

    name: text("name").notNull(),
    grade: text("grade"),
    owner: text("owner_id"),

    class: text("class").notNull(),

    description: text("description"),

    weaponMods: jsonb("weapon_mods"),
});
