import {
    pgTable,
    uuid,
    text,
    doublePrecision,
    integer,
    jsonb,
    pgEnum,
} from "drizzle-orm/pg-core";

/**
 * ENUM: warframe_class
 *
 * Legacy enum defined in migration 0000.
 * Intentionally retained to match existing DB state.
 */
export const warframeClass = pgEnum("warframe_class", [
    "normal",
    "prime",
    "umbra",
]);

/**
 * TABLE: warframe
 *
 * Legacy domain table.
 * Schema mirrors existing DB exactly.
 */
export const warframes = pgTable("warframes", {
    warframeId: uuid("warframe_id").primaryKey(),

    name: text("name").notNull(),
    class: warframeClass("class").notNull(),
    grade: text("grade"),
    owner: text("owner_id"),

    lore: text("lore"),

    baseHealth: doublePrecision("base_health"),
    effectiveHealth: doublePrecision("effective_health"),

    baseShield: doublePrecision("base_shield"),
    effectiveShield: doublePrecision("effective_shield"),

    baseArmour: doublePrecision("base_armour"),
    effectiveArmour: doublePrecision("effective_armour"),

    baseEnergy: doublePrecision("base_energy"),
    effectiveEnergy: doublePrecision("effective_energy"),

    baseAbilityStrength: doublePrecision("base_ability_strength"),
    effectiveAbilityStrength: doublePrecision("effective_ability_strength"),

    baseRange: doublePrecision("base_range"),
    effectiveRange: doublePrecision("effective_range"),

    baseDuration: doublePrecision("base_duration"),
    effectiveDuration: doublePrecision("effective_duration"),

    baseAbilityEfficiency: doublePrecision("base_ability_efficiency"),
    effectiveAbilityEfficiency: doublePrecision("effective_ability_efficiency"),

    baseSprintSpeed: doublePrecision("base_sprint_speed"),
    effectiveSprintSpeed: doublePrecision("effective_sprint_speed"),

    baseCapacity: doublePrecision("base_capacity"),
    effectiveCapacity: doublePrecision("effective_capacity"),

    maxPassives: integer("max_passives"),
    currentPassives: jsonb("current_passives"),

    maxAbilities: integer("max_abilities"),
    currentAbilities: jsonb("current_abilities"),

    maxMods: integer("max_mods"),
    currentMods: jsonb("current_mods"),

    maxAuraMods: integer("max_aura_mods"),
    currentAuraMods: jsonb("current_aura_mods"),

    maxExilusMods: integer("max_exilus_mods"),
    currentExilusMods: jsonb("current_exilus_mods"),

    maxArcanes: integer("max_arcanes"),
    currentArcanes: jsonb("current_arcanes"),

    maxShards: integer("max_shards"),
    currentShards: jsonb("current_shards"),

    weaponsLoadout: jsonb("weapons_loadout"),
});
