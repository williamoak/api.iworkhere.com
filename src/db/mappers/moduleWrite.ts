import { z } from "zod";
import {
    moduleInsertSchema,
    moduleUpdateSchema,
} from "@src/validation/module";

type ModuleInsertInput = z.infer<typeof moduleInsertSchema>;
type ModuleUpdateInput = z.infer<typeof moduleUpdateSchema>;
type ModuleWriteInput = ModuleInsertInput | ModuleUpdateInput;

/**
 * Maps validated API input (snake_case)
 * to DB write shape (camelCase)
 */
export function toModuleWrite(input: ModuleWriteInput) {
    const {
        mod_id,
        slot_type,
        max_rank,
        current_rank,
        rank_upgrades,
        ...rest
    } = input as any;

    const result: any = { ...rest };

    if (slot_type !== undefined) result.slotType = slot_type;
    if (max_rank !== undefined) result.maxRank = max_rank;
    if (current_rank !== undefined) result.currentRank = current_rank;
    if (rank_upgrades !== undefined) result.rankUpgrades = rank_upgrades;

    return result;
}

