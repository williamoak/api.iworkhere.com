import { z } from "zod";
import {
    weaponInsertSchema,
    weaponUpdateSchema,
} from "@src/validation/weapon";

type WeaponInsertInput = z.infer<typeof weaponInsertSchema>;
type WeaponUpdateInput = z.infer<typeof weaponUpdateSchema>;
type WeaponWriteInput = WeaponInsertInput | WeaponUpdateInput;

/**
 * Maps validated API input (snake_case)
 * to DB write shape (camelCase)
 */
export function toWeaponWrite(input: WeaponWriteInput) {
    const {
        weapon_id,
        weapon_mods,
        ...rest
    } = input as any;

    return {
        ...rest,
        weaponMods: weapon_mods,
    };
}
