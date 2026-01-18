import { describe, it, expect } from "vitest";
import { toWeaponWrite } from "@src/db/mappers/weaponWrite";

describe("toWeaponWrite", () => {

    it("maps weapon_mods to weaponMods", () => {
        const input = {
            weapon_mods: ["serration", "split_chamber"],
        };

        const result = toWeaponWrite(input as any);

        expect(result).toEqual({
            weaponMods: ["serration", "split_chamber"],
        });
    });

    it("drops weapon_id from write payload", () => {
        const input = {
            weapon_id: 123,
            weapon_mods: [],
        };

        const result = toWeaponWrite(input as any);

        expect(result).not.toHaveProperty("weapon_id");
    });

    it("passes through unrelated fields untouched", () => {
        const input = {
            name: "Braton",
            mastery_rank: 0,
        };

        const result = toWeaponWrite(input as any);

        expect(result).toEqual({
            name: "Braton",
            mastery_rank: 0,
        });
    });

    it("does not introduce undefined properties", () => {
        const input = {
            name: "Braton",
        };

        const result = toWeaponWrite(input as any);

        expect(Object.values(result)).not.toContain(undefined);
    });

    it("handles partial update payloads safely", () => {
        const input = {
            weapon_mods: ["point_strike"],
        };

        const result = toWeaponWrite(input as any);

        expect(result).toEqual({
            weaponMods: ["point_strike"],
        });
    });
});
