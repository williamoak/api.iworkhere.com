import { describe, it, expect } from "vitest";
import { emptyWarframe, toWarframeDTO } from "@src/dto/warframe";

describe("Warframe DTO", () => {

    describe("emptyWarframe()", () => {
        it("returns a fully initialized empty DTO", () => {
            const dto = emptyWarframe();

            expect(dto).toEqual({
                warframe_id: null,
                name: "",
                class: null,
                lore: "",

                base_health: null,
                effective_health: null,

                base_shield: null,
                effective_shield: null,

                base_armour: null,
                effective_armour: null,

                base_energy: null,
                effective_energy: null,

                base_ability_strength: null,
                effective_ability_strength: null,

                base_range: null,
                effective_range: null,

                base_duration: null,
                effective_duration: null,

                base_ability_efficiency: null,
                effective_ability_efficiency: null,

                base_sprint_speed: null,
                effective_sprint_speed: null,

                base_capacity: null,
                effective_capacity: null,

                max_passives: null,
                current_passives: null,

                max_abilities: null,
                current_abilities: null,

                max_mods: null,
                current_mods: null,

                max_aura_mods: null,
                current_aura_mods: null,

                max_exilus_mods: null,
                current_exilus_mods: null,

                max_arcanes: null,
                current_arcanes: null,

                max_shards: null,
                current_shards: null,

                weapons_loadout: null
            });
        });
    });

    describe("toWarframeDTO()", () => {
        it("maps a DB row to an API DTO correctly", () => {
            const row: any = {
                warframeId: "wf-123",
                name: "Excalibur",
                class: "normal",
                lore: null,

                baseHealth: 100,
                effectiveHealth: 300,

                baseShield: 100,
                effectiveShield: 300,

                baseArmour: 225,
                effectiveArmour: 600,

                baseEnergy: 100,
                effectiveEnergy: 300,

                baseAbilityStrength: 100,
                effectiveAbilityStrength: 200,

                baseRange: 100,
                effectiveRange: 150,

                baseDuration: 100,
                effectiveDuration: 120,

                baseAbilityEfficiency: 100,
                effectiveAbilityEfficiency: 175,

                baseSprintSpeed: 1.0,
                effectiveSprintSpeed: 1.2,

                baseCapacity: 30,
                effectiveCapacity: 60,

                maxPassives: 1,
                currentPassives: ["sword_mastery"],

                maxAbilities: 4,
                currentAbilities: ["slash_dash"],

                maxMods: 8,
                currentMods: ["steel_fiber"],

                maxAuraMods: 1,
                currentAuraMods: ["steel_charge"],

                maxExilusMods: 1,
                currentExilusMods: [],

                maxArcanes: 2,
                currentArcanes: null,

                maxShards: 5,
                currentShards: [],

                weaponsLoadout: { primary: "Braton" }
            };

            const dto = toWarframeDTO(row);

            expect(dto).toEqual({
                warframe_id: "wf-123",
                name: "Excalibur",
                class: "normal",
                lore: "",

                base_health: 100,
                effective_health: 300,

                base_shield: 100,
                effective_shield: 300,

                base_armour: 225,
                effective_armour: 600,

                base_energy: 100,
                effective_energy: 300,

                base_ability_strength: 100,
                effective_ability_strength: 200,

                base_range: 100,
                effective_range: 150,

                base_duration: 100,
                effective_duration: 120,

                base_ability_efficiency: 100,
                effective_ability_efficiency: 175,

                base_sprint_speed: 1.0,
                effective_sprint_speed: 1.2,

                base_capacity: 30,
                effective_capacity: 60,

                max_passives: 1,
                current_passives: ["sword_mastery"],

                max_abilities: 4,
                current_abilities: ["slash_dash"],

                max_mods: 8,
                current_mods: ["steel_fiber"],

                max_aura_mods: 1,
                current_aura_mods: ["steel_charge"],

                max_exilus_mods: 1,
                current_exilus_mods: [],

                max_arcanes: 2,
                current_arcanes: null,

                max_shards: 5,
                current_shards: [],

                weapons_loadout: { primary: "Braton" }
            });
        });
    });
});
