import { describe, test, expect, vi, beforeEach } from "vitest";
import type { IncomingMessage, ServerResponse } from "http";

/**
 * ------------------------------------------------------------
 * MOCKS — MUST APPEAR BEFORE HANDLER IMPORT
 * ------------------------------------------------------------
 */

vi.mock("@db/schema", async (importOriginal) => {
    const actual = await importOriginal<any>();
    return {
        ...actual,
        warframes: {
            warframeId: "warframe_id",
            name: "name",
        },
    };
});

vi.mock("@services/dbService", () => ({
    db: {
        select: vi.fn(),
    },
}));

vi.mock("@src/dto/warframe", () => ({
    emptyWarframe: vi.fn(() => ({
        warframe_id: null,
        name: null,
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
        weapons_loadout: null,
    })),
    toWarframeDTO: vi.fn((row) => ({
        warframe_id: row.warframeId,
        name: row.name,
        class: row.class ?? null,
        lore: row.lore ?? "",
        base_health: row.baseHealth ?? null,
        effective_health: row.effectiveHealth ?? null,
        base_shield: row.baseShield ?? null,
        effective_shield: row.effectiveShield ?? null,
        base_armour: row.baseArmour ?? null,
        effective_armour: row.effectiveArmour ?? null,
        base_energy: row.baseEnergy ?? null,
        effective_energy: row.effectiveEnergy ?? null,
        base_ability_strength: row.baseAbilityStrength ?? null,
        effective_ability_strength: row.effectiveAbilityStrength ?? null,
        base_range: row.baseRange ?? null,
        effective_range: row.effectiveRange ?? null,
        base_duration: row.baseDuration ?? null,
        effective_duration: row.effectiveDuration ?? null,
        base_ability_efficiency: row.baseAbilityEfficiency ?? null,
        effective_ability_efficiency: row.effectiveAbilityEfficiency ?? null,
        base_sprint_speed: row.baseSprintSpeed ?? null,
        effective_sprint_speed: row.effectiveSprintSpeed ?? null,
        base_capacity: row.baseCapacity ?? null,
        effective_capacity: row.effectiveCapacity ?? null,
        max_passives: row.maxPassives ?? null,
        current_passives: row.currentPassives ?? null,
        max_abilities: row.maxAbilities ?? null,
        current_abilities: row.currentAbilities ?? null,
        max_mods: row.maxMods ?? null,
        current_mods: row.currentMods ?? null,
        max_aura_mods: row.maxAuraMods ?? null,
        current_aura_mods: row.currentAuraMods ?? null,
        max_exilus_mods: row.maxExilusMods ?? null,
        current_exilus_mods: row.currentExilusMods ?? null,
        max_arcanes: row.maxArcanes ?? null,
        current_arcanes: row.currentArcanes ?? null,
        max_shards: row.maxShards ?? null,
        current_shards: row.currentShards ?? null,
        weapons_loadout: row.weaponsLoadout ?? null,
    })),
}));

/**
 * ------------------------------------------------------------
 * IMPORTS (AFTER MOCKS)
 * ------------------------------------------------------------
 */

import { db } from "@services/dbService";
import GET from "@routes/v1/warframe/warframes/GET";

/**
 * ------------------------------------------------------------
 * HELPERS
 * ------------------------------------------------------------
 */

function createReq(url: string): IncomingMessage {
    return ({ url } as unknown) as IncomingMessage;
}

function createRes(): ServerResponse {
    const res: Partial<ServerResponse> = {};
    res.setHeader = vi.fn();
    res.end = vi.fn();
    return res as ServerResponse;
}

/**
 * ------------------------------------------------------------
 * TESTS
 * ------------------------------------------------------------
 */

describe("GET /v1/warframe/warframes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test("returns warframe list and empty warframe when no query params supplied", async () => {
        (db.select as any).mockReturnValueOnce({
            from: () =>
                Promise.resolve([
                    { warframe_id: "1", name: "Excalibur" },
                    { warframe_id: "2", name: "Mag" },
                ]),
        });

        const req = createReq("/v1/warframe/warframes");
        const res = createRes();

        await GET(req, res);

        expect(db.select).toHaveBeenCalledOnce();
        expect(res.end).toHaveBeenCalledOnce();

        const payload = JSON.parse((res.end as any).mock.calls[0][0]);

        expect(payload.success).toBe(true);
        expect(payload.data.warframes.length).toBe(2);
        expect(payload.data.warframe).toMatchObject({
            warframe_id: null,
            name: null,
        });
    });

    test("resolves a warframe when warframe_id is provided", async () => {
        (db.select as any)
            .mockReturnValueOnce({
                from: () =>
                    Promise.resolve([
                        { warframe_id: "1", name: "Excalibur" },
                    ]),
            })
            .mockReturnValueOnce({
                from: () => ({
                    where: () =>
                        Promise.resolve([
                            {
                                warframeId: "1",
                                name: "Excalibur",
                                baseHealth: 100,
                                baseShield: 100,
                                baseArmour: 225,
                                baseEnergy: 100,
                            },
                        ]),
                }),
            });

        const req = createReq(
            "/v1/warframe/warframes?warframe_id=660e8400-e29b-41d4-a716-446655440010"
        );
        const res = createRes();

        await GET(req, res);

        expect(db.select).toHaveBeenCalledTimes(2);

        const payload = JSON.parse((res.end as any).mock.calls[0][0]);
        expect(payload.data.warframe.name).toBe("Excalibur");
        expect(payload.data.warframe.base_health).toBe(100);
    });

    test("returns empty warframe when warframe_id does not match any record", async () => {
        (db.select as any)
            .mockReturnValueOnce({
                from: () =>
                    Promise.resolve([
                        { warframe_id: "1", name: "Excalibur" },
                    ]),
            })
            .mockReturnValueOnce({
                from: () => ({
                    where: () => Promise.resolve([]),
                }),
            });

        const req = createReq(
            "/v1/warframe/warframes?warframe_id=nonexistent"
        );
        const res = createRes();

        await GET(req, res);

        const payload = JSON.parse((res.end as any).mock.calls[0][0]);
        expect(payload.data.warframe).toMatchObject({
            warframe_id: null,
            name: null,
        });
    });
});
