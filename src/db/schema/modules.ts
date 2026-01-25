import {
    pgTable,
    uuid,
    text,
    integer,
    jsonb,
    pgEnum,
} from "drizzle-orm/pg-core";

/**
 * ENUM: module_slot_type
 *
 * Legacy enum defined in migration 0001.
 * Retained to mirror existing DB state.
 */
export const moduleSlotType = pgEnum("module_slot_type", [
    "Aura",
    "Exilus",
    "General",
    "Arcane",
]);

/**
 * TABLE: modules
 *
 * Legacy domain table.
 * Schema mirrors existing DB exactly.
 */
export const modules = pgTable("modules", {
    modId: uuid("mod_id").primaryKey(),
    name: text("name").notNull(),
    grade: text("grade"),
    owner: text("owner_id"),
    polarity: text("polarity"),
    capacity: integer("capacity"),

    type: text("type").notNull(),

    slotType: moduleSlotType("slot_type").notNull(),

    description: text("description"),

    maxRank: integer("max_rank"),
    currentRank: integer("current_rank"),

    rankUpgrades: jsonb("rank_upgrades"),

    locked: jsonb("locked"),

    modify: jsonb("modify"),
});
