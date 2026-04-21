import { z } from 'zod';

/**
 * Base fields shared by insert & update
 *
 * NOTE:
 * - `class` is optional and nullable here.
 * - Defaulting to "normal" is handled at the route level,
 *   not in the schema.
 */
const weaponBaseFields = {
  name: z.string().min(1),
  class: z.string().nullable().optional(),
  description: z.string().optional(),
  weapon_mods: z.any().nullable().optional(),
};

/**
 * INSERT schema
 * - Required fields enforced
 * - No weapon_id allowed
 */
export const weaponInsertSchema = z.object({
  ...weaponBaseFields,
});

/**
 * UPDATE schema (by weapon_id)
 * - weapon_id is required
 * - All other fields are optional
 */
export const weaponUpdateSchema = z.object({
  weapon_id: z.string().uuid(),
  ...Object.fromEntries(
    Object.entries(weaponBaseFields).map(([key, schema]) => [
      key,
      schema.optional(),
    ]),
  ),
});

/**
 * UPDATE schema (by name)
 * - name is required
 * - weapon_id is NOT allowed here
 * - All other fields are optional
 *
 * Used when resolving updates by name (+ optional class)
 */
export const weaponUpdateByNameSchema = z.object({
  name: z.string().min(1),
  class: z.string().nullable().optional(),
  description: z.string().optional(),
  weapon_mods: z.any().nullable().optional(),
});
