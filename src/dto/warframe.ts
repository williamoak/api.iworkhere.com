import type { InferSelectModel } from 'drizzle-orm';
import { warframes as warframeSchema } from '@db/schema';

/**
 * DB row type (camelCase, Drizzle-generated)
 */
export type WarframeRow = InferSelectModel<typeof warframeSchema>;

/**
 * API-facing Warframe DTO (snake_case)
 * This is the contract returned to clients
 */
export type WarframeDTO = {
  warframe_id: string | null;
  name: string;
  class: string | null;
  lore: string;

  base_health: number | null;
  effective_health: number | null;

  base_shield: number | null;
  effective_shield: number | null;

  base_armour: number | null;
  effective_armour: number | null;

  base_energy: number | null;
  effective_energy: number | null;

  base_ability_strength: number | null;
  effective_ability_strength: number | null;

  base_range: number | null;
  effective_range: number | null;

  base_duration: number | null;
  effective_duration: number | null;

  base_ability_efficiency: number | null;
  effective_ability_efficiency: number | null;

  base_sprint_speed: number | null;
  effective_sprint_speed: number | null;

  base_capacity: number | null;
  effective_capacity: number | null;

  max_passives: number | null;
  current_passives: unknown | null;

  max_abilities: number | null;
  current_abilities: unknown | null;

  max_mods: number | null;
  current_mods: unknown | null;

  max_aura_mods: number | null;
  current_aura_mods: unknown | null;

  max_exilus_mods: number | null;
  current_exilus_mods: unknown | null;

  max_arcanes: number | null;
  current_arcanes: unknown | null;

  max_shards: number | null;
  current_shards: unknown | null;

  weapons_loadout: unknown | null;
};

/**
 * Factory: empty Warframe DTO
 * Used when no DB record exists
 */
export function emptyWarframe(): WarframeDTO {
  return {
    warframe_id: null,
    name: '',
    class: null,
    lore: '',

    base_health: null,
    effective_health: null,
    base_shield: null,
    effective_shield: null,
    base_armour: null,
    effective_armour: null,
    base_energy: null,
    effective_energy: null,

    base_ability_strength: null,
    effective_ability_strength: null,
    base_range: null,
    effective_range: null,
    base_duration: null,
    effective_duration: null,
    base_ability_efficiency: null,
    effective_ability_efficiency: null,
    base_sprint_speed: null,
    effective_sprint_speed: null,
    base_capacity: null,
    effective_capacity: null,

    max_passives: null,
    current_passives: null,
    max_abilities: null,
    current_abilities: null,
    max_mods: null,
    current_mods: null,
    max_aura_mods: null,
    current_aura_mods: null,
    max_exilus_mods: null,
    current_exilus_mods: null,
    max_arcanes: null,
    current_arcanes: null,
    max_shards: null,
    current_shards: null,

    weapons_loadout: null,
  };
}

/**
 * Mapper: DB row -> API DTO
 */
export function toWarframeDTO(row: WarframeRow): WarframeDTO {
  return {
    warframe_id: row.warframeId,
    name: row.name,
    class: row.class,
    lore: row.lore ?? '',

    base_health: row.baseHealth,
    effective_health: row.effectiveHealth,

    base_shield: row.baseShield,
    effective_shield: row.effectiveShield,

    base_armour: row.baseArmour,
    effective_armour: row.effectiveArmour,

    base_energy: row.baseEnergy,
    effective_energy: row.effectiveEnergy,

    base_ability_strength: row.baseAbilityStrength,
    effective_ability_strength: row.effectiveAbilityStrength,

    base_range: row.baseRange,
    effective_range: row.effectiveRange,

    base_duration: row.baseDuration,
    effective_duration: row.effectiveDuration,

    base_ability_efficiency: row.baseAbilityEfficiency,
    effective_ability_efficiency: row.effectiveAbilityEfficiency,

    base_sprint_speed: row.baseSprintSpeed,
    effective_sprint_speed: row.effectiveSprintSpeed,

    base_capacity: row.baseCapacity,
    effective_capacity: row.effectiveCapacity,

    max_passives: row.maxPassives,
    current_passives: row.currentPassives,

    max_abilities: row.maxAbilities,
    current_abilities: row.currentAbilities,

    max_mods: row.maxMods,
    current_mods: row.currentMods,

    max_aura_mods: row.maxAuraMods,
    current_aura_mods: row.currentAuraMods,

    max_exilus_mods: row.maxExilusMods,
    current_exilus_mods: row.currentExilusMods,

    max_arcanes: row.maxArcanes,
    current_arcanes: row.currentArcanes,

    max_shards: row.maxShards,
    current_shards: row.currentShards,

    weapons_loadout: row.weaponsLoadout,
  };
}
