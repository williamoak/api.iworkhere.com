import { describe, it, expect } from "vitest";
import { toModuleWrite } from "@src/db/mappers/moduleWrite";

describe("toModuleWrite", () => {

    it("maps snake_case fields to camelCase for insert input", () => {
        const input = {
            slot_type: "warframe",
            max_rank: 10,
            current_rank: 3,
            rank_upgrades: 6,

            // passthrough fields
            name: "Test Mod",
            polarity: "madurai"
        };

        const result = toModuleWrite(input as any);

        expect(result).toEqual({
            name: "Test Mod",
            polarity: "madurai",

            slotType: "warframe",
            maxRank: 10,
            currentRank: 3,
            rankUpgrades: 6
        });
    });

    it("drops mod_id from write payload", () => {
        const input = {
            mod_id: 123,

            slot_type: "weapon",
            max_rank: 5,
            current_rank: 0,
            rank_upgrades: 5
        };

        const result = toModuleWrite(input as any);

        expect(result).not.toHaveProperty("mod_id");
    });

    it("handles update input shape the same way", () => {
        const input = {
            mod_id: 999,
            current_rank: 7,
            rank_upgrades: 10
        };

        const result = toModuleWrite(input as any);

        expect(result).toEqual({
            currentRank: 7,
            rankUpgrades: 10
        });
    });

    it("does not introduce undefined properties", () => {
        const input = {
            slot_type: "companion"
        };

        const result = toModuleWrite(input as any);

        expect(result).toEqual({
            slotType: "companion"
        });

        expect(Object.values(result)).not.toContain(undefined);
    });
});
