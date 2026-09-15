import { describe, it, expect } from "vitest";
import { toWarframeWrite } from "@src/db/mappers/warframeWrite";

describe("toWarframeWrite", () => {

    it("maps all snake_case fields to camelCase correctly", () => {
        const input = {
            warframe_id: 1,
            base_health: 300,
            effective_health: 450,
            base_shield: 100,
            effective_shield: 200,
            base_armour: 250,
            effective_armour: 350,
            base_energy: 150,
            effective_energy: 225,

            base_ability_strength: 100,
            effective_ability_strength: 130,
            base_range: 100,
            effective_range: 145,
            base_duration: 100,
            effective_duration: 155,
            base_ability_efficiency: 100,
            effective_ability_efficiency: 160,
            base_sprint_speed: 1.0,
            effective_sprint_speed: 1.15,
            base_capacity: 60,
            effective_capacity: 74,

            max_passives: 1,
            current_passives: 1,
            max_abilities: 4,
            current_abilities: 4,
            max_mods: 8,
            current_mods: 8,
            max_aura_mods: 1,
            current_aura_mods: 1,
            max_exilus_mods: 1,
            current_exilus_mods: 1,
            max_arcanes: 2,
            current_arcanes: 2,
            max_shards: 5,
            current_shards: 5,

            weapons_loadout: { primary: "Braton" },
            custom_extra: "extra",
        };

        const result = toWarframeWrite(input as any);

        expect(result).toEqual({
            baseHealth: 300,
            effectiveHealth: 450,
            baseShield: 100,
            effectiveShield: 200,
            baseArmour: 250,
            effectiveArmour: 350,
            baseEnergy: 150,
            effectiveEnergy: 225,

            baseAbilityStrength: 100,
            effectiveAbilityStrength: 130,
            baseRange: 100,
            effectiveRange: 145,
            baseDuration: 100,
            effectiveDuration: 155,
            baseAbilityEfficiency: 100,
            effectiveAbilityEfficiency: 160,
            baseSprintSpeed: 1.0,
            effectiveSprintSpeed: 1.15,
            baseCapacity: 60,
            effectiveCapacity: 74,

            maxPassives: 1,
            currentPassives: 1,
            maxAbilities: 4,
            currentAbilities: 4,
            maxMods: 8,
            currentMods: 8,
            maxAuraMods: 1,
            currentAuraMods: 1,
            maxExilusMods: 1,
            currentExilusMods: 1,
            maxArcanes: 2,
            currentArcanes: 2,
            maxShards: 5,
            currentShards: 5,

            weaponsLoadout: { primary: "Braton" },
            custom_extra: "extra",
        });
    });

    it("drops warframe_id from write payload", () => {
        const input = {
            warframe_id: 42,
            base_health: 300,
        };

        const result = toWarframeWrite(input as any);

        expect(result).not.toHaveProperty("warframe_id");
    });

    it("passes through unrelated fields untouched", () => {
        const input = {
            name: "Excalibur",
            mastery_rank: 0,
        };

        const result = toWarframeWrite(input as any);

        expect(result).toEqual({
            name: "Excalibur",
            mastery_rank: 0,
        });
    });

    it("does not introduce undefined properties", () => {
        const input = {
            base_health: 300,
        };

        const result = toWarframeWrite(input as any);

        expect(Object.values(result)).not.toContain(undefined);
    });

    it("handles update-style partial payloads safely", () => {
        const input = {
            current_shards: 3,
            effective_armour: 550,
        };

        const result = toWarframeWrite(input as any);

        expect(result).toEqual({
            currentShards: 3,
            effectiveArmour: 550,
        });
    });
});
