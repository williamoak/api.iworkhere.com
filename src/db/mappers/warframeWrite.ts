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

    const result: any = { ...rest };

    if (base_health !== undefined) result.baseHealth = base_health;
    if (effective_health !== undefined) result.effectiveHealth = effective_health;
    if (base_shield !== undefined) result.baseShield = base_shield;
    if (effective_shield !== undefined) result.effectiveShield = effective_shield;
    if (base_armour !== undefined) result.baseArmour = base_armour;
    if (effective_armour !== undefined) result.effectiveArmour = effective_armour;
    if (base_energy !== undefined) result.baseEnergy = base_energy;
    if (effective_energy !== undefined) result.effectiveEnergy = effective_energy;

    if (base_ability_strength !== undefined) result.baseAbilityStrength = base_ability_strength;
    if (effective_ability_strength !== undefined) result.effectiveAbilityStrength = effective_ability_strength;
    if (base_range !== undefined) result.baseRange = base_range;
    if (effective_range !== undefined) result.effectiveRange = effective_range;
    if (base_duration !== undefined) result.baseDuration = base_duration;
    if (effective_duration !== undefined) result.effectiveDuration = effective_duration;
    if (base_ability_efficiency !== undefined) result.baseAbilityEfficiency = base_ability_efficiency;
    if (effective_ability_efficiency !== undefined) result.effectiveAbilityEfficiency = effective_ability_efficiency;
    if (base_sprint_speed !== undefined) result.baseSprintSpeed = base_sprint_speed;
    if (effective_sprint_speed !== undefined) result.effectiveSprintSpeed = effective_sprint_speed;
    if (base_capacity !== undefined) result.baseCapacity = base_capacity;
    if (effective_capacity !== undefined) result.effectiveCapacity = effective_capacity;

    if (max_passives !== undefined) result.maxPassives = max_passives;
    if (current_passives !== undefined) result.currentPassives = current_passives;
    if (max_abilities !== undefined) result.maxAbilities = max_abilities;
    if (current_abilities !== undefined) result.currentAbilities = current_abilities;
    if (max_mods !== undefined) result.maxMods = max_mods;
    if (current_mods !== undefined) result.currentMods = current_mods;
    if (max_aura_mods !== undefined) result.maxAuraMods = max_aura_mods;
    if (current_aura_mods !== undefined) result.currentAuraMods = current_aura_mods;
    if (max_exilus_mods !== undefined) result.maxExilusMods = max_exilus_mods;
    if (current_exilus_mods !== undefined) result.currentExilusMods = current_exilus_mods;
    if (max_arcanes !== undefined) result.maxArcanes = max_arcanes;
    if (current_arcanes !== undefined) result.currentArcanes = current_arcanes;
    if (max_shards !== undefined) result.maxShards = max_shards;
    if (current_shards !== undefined) result.currentShards = current_shards;

    if (weapons_loadout !== undefined) result.weaponsLoadout = weapons_loadout;

    return result;
}
