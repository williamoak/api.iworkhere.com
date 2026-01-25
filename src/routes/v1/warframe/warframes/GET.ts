import type { IncomingMessage, ServerResponse } from "http";
import { URL } from "url";

import { db } from "@services/dbService";
import { warframes } from "@db/schema";
import { inArray } from "drizzle-orm";
import { emptyWarframe, toWarframeDTO } from "@src/dto/warframe";

/**
 * GET /v1/warframe/warframes
 */
export default async function GET(
    req: IncomingMessage,
    res: ServerResponse
) {
    try {
        const url = new URL(req.url ?? "", "http://localhost");
        const warframeIds = url.searchParams.getAll("warframe_id");

        /* --------------------------------------------------
         * 1) Always fetch lightweight warframe list
         * -------------------------------------------------- */

        const warframeList = await db
            .select({
                warframe_id: warframes.warframeId,
                name: warframes.name,
            })
            .from(warframes);

        let currentWarframe = emptyWarframe();

        /* --------------------------------------------------
         * 2) Resolve a single warframe if requested
         * -------------------------------------------------- */

        if (warframeIds.length > 0) {
            const rows = await db
                .select()
                .from(warframes)
                .where(inArray(warframes.warframeId, warframeIds));

            if (rows.length > 0) {
                currentWarframe = toWarframeDTO(rows[0]);
            }
        }

        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(
            JSON.stringify({
                success: true,
                data: {
                    warframes: warframeList,
                    warframe: currentWarframe,
                },
            })
        );
    } catch (err) {
        console.error("GET /warframes error:", err);

        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(
            JSON.stringify({
                success: false,
                error: "Internal server error",
            })
        );
    }
}
