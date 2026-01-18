import { describe, it, expect } from "@jest/globals";
import { emptyWeapon, toWeaponDTO } from "@src/dto/weapon.ts";

describe("Weapon DTO", () => {
    describe("emptyWeapon()", () => {
        it("returns a fully initialized empty DTO", () => {
            const dto = emptyWeapon();

            expect(dto).toEqual({
                weapon_id: null,
                name: "",
                class: null,
                description: "",
                weapon_mods: null
            });
        });
    });

    describe("toWeaponDTO()", () => {
        it("maps a DB row to an API DTO correctly", () => {
            const row: any = {
                weaponId: "wpn-123",
                name: "Braton",
                class: "normal",
                description: null,
                weaponMods: ["serration", "split_chamber"]
            };

            const dto = toWeaponDTO(row);

            expect(dto).toEqual({
                weapon_id: "wpn-123",
                name: "Braton",
                class: "normal",
                description: "",
                weapon_mods: ["serration", "split_chamber"]
            });
        });
    });
});
