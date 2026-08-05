/**
 * @myDocBlock
 * @file weaponWrite.ts
 * @internal
 * @module Database
 * @tag db, mapper
 * @version 1.0.0
 * @author william.r.oak@gmail.com
 * @path src/db/mappers/weaponWrite.ts
 * @summary Map weapon API input to database write shape.
 * @description
 *   Transforms validated API input using snake_case into the database-compatible
 *   camelCase shape.
 * @query {}
 * @requestExample none
 * @response none
 * @requires {
 *   "dependencies": []
 * }
 */
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
