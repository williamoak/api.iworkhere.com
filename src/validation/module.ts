import { z } from "zod";

/**
 * Allowed module slot types (must match DB enum)
 */
export const moduleSlotTypeEnum = z.enum([
    "Aura",
    "Exilus",
    "General",
    "Arcane",
]);

/**
 * Base fields shared by insert & update
 *
 * NOTE:
 * - Required-ness is enforced by the schema using these fields
 * - Defaults are NOT handled here
 */
const moduleBaseFields = {
    name: z.string().min(1),
    polarity: z.string().nullable().optional(),
    capacity: z.number().int().nullable().optional(),
    type: z.string().nullable().optional(),
    slot_type: moduleSlotTypeEnum.optional(),
    description: z.string().optional(),

    max_rank: z.number().int().nullable().optional(),
    current_rank: z.number().int().nullable().optional(),

    rank_upgrades: z.any().nullable().optional(),
    locked: z.any().nullable().optional(),
    modify: z.any().nullable().optional(),
};

/**
 * INSERT schema
 * - Only name is required
 * - Everything else may be filled in later
 */
export const moduleInsertSchema = z.object({
    name: moduleBaseFields.name,
    ...Object.fromEntries(
        Object.entries(moduleBaseFields)
            .filter(([k]) => k !== "name")
            .map(([k, v]) => [k, v.optional()])
    ),
});

/**
 * UPDATE schema (by mod_id)
 */
export const moduleUpdateSchema = z.object({
    mod_id: z.string().uuid(),
    ...Object.fromEntries(
        Object.entries(moduleBaseFields).map(([k, v]) => [k, v.optional()])
    ),
});

/**
 * UPDATE schema (by name)
 * - name is required
 * - mod_id is NOT allowed
 */
export const moduleUpdateByNameSchema = z.object({
    name: z.string().min(1),
    ...Object.fromEntries(
        Object.entries(moduleBaseFields)
            .filter(([k]) => k !== "name")
            .map(([k, v]) => [k, v.optional()])
    ),
});
