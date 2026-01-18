import type { InferSelectModel } from "drizzle-orm";
import { modules } from "@db/schema";

export type ModuleRow = InferSelectModel<typeof modules>;

export type ModuleDTO = {
    mod_id: string | null;
    name: string;
    polarity: string | null;
    capacity: number | null;
    type: string | null;
    slot_type: string | null;
    description: string;
    max_rank: number | null;
    current_rank: number | null;
    rank_upgrades: any | null;
    locked: any | null;
    modify: any | null;
};

export function emptyModule(): ModuleDTO {
    return {
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
        modify: null,
    };
}

/**
 * Map DB row -> API DTO
 */
export function toModuleDTO(row: ModuleRow): ModuleDTO {
    return {
        mod_id: row.modId,
        name: row.name,
        polarity: row.polarity,
        capacity: row.capacity,
        type: row.type,
        slot_type: row.slotType,
        description: row.description ?? "",
        max_rank: row.maxRank,
        current_rank: row.currentRank,
        rank_upgrades: row.rankUpgrades,
        locked: row.locked,
        modify: row.modify,
    };
}
