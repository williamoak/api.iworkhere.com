import {
    pgTable,
    uuid,
    text,
    jsonb,
} from "drizzle-orm/pg-core";

/**
 * TABLE: warframe_weapons
 */
export const weapons = pgTable("warframe_weapons", {
    weaponId: uuid("weapon_id")
        .defaultRandom()
        .primaryKey(),

    name: text("name").notNull(),

    class: text("class").notNull(),

    description: text("description"),

    weaponMods: jsonb("weapon_mods"),
});
