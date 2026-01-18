import { describe, it, expect } from "vitest";
import { toWarframeWrite } from "@src/db/mappers/warframeWrite";

describe("toWarframeWrite", () => {

    it("maps snake_case fields to camelCase", () => {
        const input = {
            base_health: 300,
            effective_health: 450,
            base_shield: 100,
            effective_shield: 200,
            base_energy: 150,
            effective_energy: 225,
        };

        const result = toWarframeWrite(input as any);

        expect(result).toEqual({
            baseHealth: 300,
            effectiveHealth: 450,
            baseShield: 100,
            effectiveShield: 200,
            baseEnergy: 150,
            effectiveEnergy: 225,
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
