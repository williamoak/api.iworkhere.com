import type { InferSelectModel } from "drizzle-orm";
import { weapons as weaponsSchema } from "@db/schema";

/**
 * DB row type (camelCase, Drizzle-generated)
 */
export type WeaponRow = InferSelectModel<typeof weaponsSchema>;

/**
 * API-facing Weapon DTO (snake_case)
 * Stable contract returned to clients
 */
export type WeaponDTO = {
    weapon_id: string | null;
    name: string;
    class: string | null;
    description: string;
    weapon_mods: any | null;
};

/**
 * Factory: empty Weapon DTO
 * Used when no DB record exists
 */
export function emptyWeapon(): WeaponDTO {
    return {
        weapon_id: null,
        name: "",
        class: null,
        description: "",
        weapon_mods: null,
    };
}

/**
 * Mapper: DB row -> API DTO
 */
export function toWeaponDTO(row: WeaponRow): WeaponDTO {
    return {
        weapon_id: row.weaponId,
        name: row.name,
        class: row.class,
        description: row.description ?? "",
        weapon_mods: row.weaponMods,
    };
}
