import { describe, test, expect, vi, beforeEach } from "vitest";
import type { IncomingMessage, ServerResponse } from "http";

/**
 * ------------------------------------------------------------
 * MOCKS — MUST APPEAR BEFORE HANDLER IMPORT
 * ------------------------------------------------------------
 */

/**
 * IMPORTANT:
 * - Handler imports `warframes` (plural)
 * - Tests previously mocked `warframe` (singular) ❌
 */
vi.mock("@db/schema", async (importOriginal) => {
    const actual = await importOriginal<any>();
    return {
        ...actual,
        warframes: {
            warframeId: "warframe_id",
        },
    };
});

vi.mock("@services/dbService", () => ({
    db: {
        delete: vi.fn(),
    },
}));

/**
 * ------------------------------------------------------------
 * IMPORTS (AFTER MOCKS)
 * ------------------------------------------------------------
 */

import { db } from "@services/dbService";
import DELETE from "@routes/v1/warframe/warframes/DELETE";

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

describe("DELETE /v1/warframe/warframes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    /**
     * ------------------------------------------------------------
     * SUCCESS — record exists
     * ------------------------------------------------------------
     */
    test("deletes a warframe by warframe_id and returns deleted record", async () => {
        (db.delete as any).mockReturnValueOnce({
            where: () => ({
                returning: () =>
                    Promise.resolve([
                        {
                            warframeId: "1",
                            name: "Excalibur",
                            health: 100,
                            shield: 100,
                            armor: 225,
                            energy: 100,
                        },
                    ]),
            }),
        });

        const req = createReq(
            "/v1/warframe/warframes?warframe_id=660e8400-e29b-41d4-a716-446655440010"
        );
        const res = createRes();

        await DELETE(req, res);

        expect(db.delete).toHaveBeenCalledOnce();
        expect(res.end).toHaveBeenCalledOnce();

        const payload = JSON.parse((res.end as any).mock.calls[0][0]);
        expect(payload.success).toBe(true);
        expect(payload.data.name).toBe("Excalibur");
    });

    /**
     * ------------------------------------------------------------
     * SUCCESS — no matching record
     * ------------------------------------------------------------
     */
    test("succeeds with null data when no matching warframe exists", async () => {
        (db.delete as any).mockReturnValueOnce({
            where: () => ({
                returning: () => Promise.resolve([]),
            }),
        });

        const req = createReq(
            "/v1/warframe/warframes?warframe_id=nonexistent-id"
        );
        const res = createRes();

        await DELETE(req, res);

        expect(res.end).toHaveBeenCalledOnce();

        const payload = JSON.parse((res.end as any).mock.calls[0][0]);
        expect(payload.success).toBe(true);
        expect(payload.data).toBeNull();
    });

    /**
     * ------------------------------------------------------------
     * ERROR — missing warframe_id
     * ------------------------------------------------------------
     */
    test("returns 400 when warframe_id is missing", async () => {
        const req = createReq("/v1/warframe/warframes");
        const res = createRes();

        await DELETE(req, res);

        expect(res.end).toHaveBeenCalledOnce();

        const payload = JSON.parse((res.end as any).mock.calls[0][0]);
        expect(payload.success).toBe(false);
        expect(payload.error).toContain("warframe_id is required");
    });
});
