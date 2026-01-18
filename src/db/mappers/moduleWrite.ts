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

    return {
        ...rest,

        slotType: slot_type,
        maxRank: max_rank,
        currentRank: current_rank,
        rankUpgrades: rank_upgrades,
    };
}
