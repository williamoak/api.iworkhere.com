import { z } from "zod";
import {
    warframeInsertSchema,
    warframeUpdateSchema,
} from "@src/validation/warframe";

type WarframeInsertInput = z.infer<typeof warframeInsertSchema>;
type WarframeUpdateInput = z.infer<typeof warframeUpdateSchema>;
type WarframeWriteInput = WarframeInsertInput | WarframeUpdateInput;

/**
 * Maps validated API input (snake_case)
 * to DB write shape (camelCase)
 */
export function toWarframeWrite(input: WarframeWriteInput) {
    const {
        warframe_id,

        base_health,
        effective_health,
        base_shield,
        effective_shield,
        base_armour,
        effective_armour,
        base_energy,
        effective_energy,

        base_ability_strength,
        effective_ability_strength,
        base_range,
        effective_range,
        base_duration,
        effective_duration,
        base_ability_efficiency,
        effective_ability_efficiency,
        base_sprint_speed,
        effective_sprint_speed,
        base_capacity,
        effective_capacity,

        max_passives,
        current_passives,
        max_abilities,
        current_abilities,
        max_mods,
        current_mods,
        max_aura_mods,
        current_aura_mods,
        max_exilus_mods,
        current_exilus_mods,
        max_arcanes,
        current_arcanes,
        max_shards,
        current_shards,

        weapons_loadout,
        ...rest
    } = input as any;

    return {
        ...rest,

        baseHealth: base_health,
        effectiveHealth: effective_health,
        baseShield: base_shield,
        effectiveShield: effective_shield,
        baseArmour: base_armour,
        effectiveArmour: effective_armour,
        baseEnergy: base_energy,
        effectiveEnergy: effective_energy,

        baseAbilityStrength: base_ability_strength,
        effectiveAbilityStrength: effective_ability_strength,
        baseRange: base_range,
        effectiveRange: effective_range,
        baseDuration: base_duration,
        effectiveDuration: effective_duration,
        baseAbilityEfficiency: base_ability_efficiency,
        effectiveAbilityEfficiency: effective_ability_efficiency,
        baseSprintSpeed: base_sprint_speed,
        effectiveSprintSpeed: effective_sprint_speed,
        baseCapacity: base_capacity,
        effectiveCapacity: effective_capacity,

        maxPassives: max_passives,
        currentPassives: current_passives,
        maxAbilities: max_abilities,
        currentAbilities: current_abilities,
        maxMods: max_mods,
        currentMods: current_mods,
        maxAuraMods: max_aura_mods,
        currentAuraMods: current_aura_mods,
        maxExilusMods: max_exilus_mods,
        currentExilusMods: current_exilus_mods,
        maxArcanes: max_arcanes,
        currentArcanes: current_arcanes,
        maxShards: max_shards,
        currentShards: current_shards,

        weaponsLoadout: weapons_loadout,
    };
}
