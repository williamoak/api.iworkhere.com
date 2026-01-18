/**
 * Maps validated API input (snake_case)
 * to DB write shape (camelCase)
 */
export function toWeaponWrite(input: unknown) {
    const {
        weapon_id,
        weapon_mods,
        ...rest
    } = input as any;

    const result: any = { ...rest };

    if (weapon_mods !== undefined) {
        result.weaponMods = weapon_mods;
    }

    return result;
}
