import { z } from 'zod';

/**
 * Allowed warframe classes (must match DB enum)
 */
export const warframeClassEnum = z.enum(['normal', 'prime', 'umbra']);

/**
 * Base fields shared by insert & update
 */
const warframeBaseFields = {
  name: z.string().min(1),
  class: warframeClassEnum,

  lore: z.string().optional(),
  base_health: z.number().nullable().optional(),
  effective_health: z.number().nullable().optional(),
  base_shield: z.number().nullable().optional(),
  effective_shield: z.number().nullable().optional(),
  base_armour: z.number().nullable().optional(),
  effective_armour: z.number().nullable().optional(),
  base_energy: z.number().nullable().optional(),
  effective_energy: z.number().nullable().optional(),
  base_ability_strength: z.number().nullable().optional(),
  effective_ability_strength: z.number().nullable().optional(),
  base_range: z.number().nullable().optional(),
  effective_range: z.number().nullable().optional(),
  base_duration: z.number().nullable().optional(),
  effective_duration: z.number().nullable().optional(),
  base_ability_efficiency: z.number().nullable().optional(),
  effective_ability_efficiency: z.number().nullable().optional(),
  base_sprint_speed: z.number().nullable().optional(),
  effective_sprint_speed: z.number().nullable().optional(),
  base_capacity: z.number().nullable().optional(),
  effective_capacity: z.number().nullable().optional(),
  max_passives: z.number().int().nullable().optional(),
  current_passives: z.any().nullable().optional(),
  max_abilities: z.number().int().nullable().optional(),
  current_abilities: z.any().nullable().optional(),
  max_mods: z.number().int().nullable().optional(),
  current_mods: z.any().nullable().optional(),
  max_aura_mods: z.number().int().nullable().optional(),
  current_aura_mods: z.any().nullable().optional(),
  max_exilus_mods: z.number().int().nullable().optional(),
  current_exilus_mods: z.any().nullable().optional(),
  max_arcanes: z.number().int().nullable().optional(),
  current_arcanes: z.any().nullable().optional(),
  max_shards: z.number().int().nullable().optional(),
  current_shards: z.any().nullable().optional(),
  weapons_loadout: z.any().nullable().optional(),
};

export const warframeUpdateByNameSchema = z.object({
  name: z.string().min(1),
  class: z.enum(['normal', 'prime', 'umbra']).optional(),

  lore: z.string().optional(),

  base_health: z.number().nullable().optional(),
  effective_health: z.number().nullable().optional(),

  base_shield: z.number().nullable().optional(),
  effective_shield: z.number().nullable().optional(),

  base_armour: z.number().nullable().optional(),
  effective_armour: z.number().nullable().optional(),

  base_energy: z.number().nullable().optional(),
  effective_energy: z.number().nullable().optional(),

  base_ability_strength: z.number().nullable().optional(),
  effective_ability_strength: z.number().nullable().optional(),

  base_range: z.number().nullable().optional(),
  effective_range: z.number().nullable().optional(),

  base_duration: z.number().nullable().optional(),
  effective_duration: z.number().nullable().optional(),

  base_ability_efficiency: z.number().nullable().optional(),
  effective_ability_efficiency: z.number().nullable().optional(),

  base_sprint_speed: z.number().nullable().optional(),
  effective_sprint_speed: z.number().nullable().optional(),

  base_capacity: z.number().nullable().optional(),
  effective_capacity: z.number().nullable().optional(),

  max_passives: z.number().nullable().optional(),
  current_passives: z.any().nullable().optional(),

  max_abilities: z.number().nullable().optional(),
  current_abilities: z.any().nullable().optional(),

  max_mods: z.number().nullable().optional(),
  current_mods: z.any().nullable().optional(),

  max_aura_mods: z.number().nullable().optional(),
  current_aura_mods: z.any().nullable().optional(),

  max_exilus_mods: z.number().nullable().optional(),
  current_exilus_mods: z.any().nullable().optional(),

  max_arcanes: z.number().nullable().optional(),
  current_arcanes: z.any().nullable().optional(),

  max_shards: z.number().nullable().optional(),
  current_shards: z.any().nullable().optional(),

  weapons_loadout: z.any().nullable().optional(),
});

/**
 * INSERT schema (required fields enforced)
 */
export const warframeInsertSchema = z
  .object({
    name: z.string().min(1, 'name is required'),
    class: z.enum(['normal', 'prime', 'umbra']),
  })
  .passthrough();

/**
 * UPDATE schema (partial update allowed)
 */
export const warframeUpdateSchema = z.object({
  warframe_id: z.string().uuid(),
  ...Object.fromEntries(
    Object.entries(warframeBaseFields).map(([k, v]) => [k, v.optional()]),
  ),
});
