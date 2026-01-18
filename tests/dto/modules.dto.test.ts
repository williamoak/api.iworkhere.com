import { describe, it, expect } from "vitest";
import { emptyModule, toModuleDTO } from "@src/dto/module";

describe("Module DTO", () => {

    describe("emptyModule()", () => {
        it("returns a fully initialized empty DTO", () => {
            const dto = emptyModule();

            expect(dto).toEqual({
                mod_id: null,
                name: "",
                polarity: null,
                capacity: null,
                type: null,
                slot_type: null,
                description: "",
                max_rank: null,
                current_rank: null,
                rank_upgrades: null,
                locked: null,
                modify: null
            });
        });
    });

    describe("toModuleDTO()", () => {
        it("maps a DB row to an API DTO correctly", () => {
            const row: any = {
                modId: "mod-123",
                name: "Vitality",
                polarity: "vazarin",
                capacity: 12,
                type: "warframe",
                slotType: "normal",
                description: null,
                maxRank: 10,
                currentRank: 5,
                rankUpgrades: [1, 2, 3],
                locked: false,
                modify: { health: "+440%" }
            };

            const dto = toModuleDTO(row);

            expect(dto).toEqual({
                mod_id: "mod-123",
                name: "Vitality",
                polarity: "vazarin",
                capacity: 12,
                type: "warframe",
                slot_type: "normal",
                description: "",
                max_rank: 10,
                current_rank: 5,
                rank_upgrades: [1, 2, 3],
                locked: false,
                modify: { health: "+440%" }
            });
        });
    });
});
