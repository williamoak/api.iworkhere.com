import { beforeEach, describe, expect, test, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";

vi.mock("@services/dbService", () => ({
    db: {
        select: vi.fn(),
    },
}));

vi.mock("@db/schema", () => ({
    authTokens: {
        userId: "user_id",
        tokenHash: "token_hash",
        tokenType: "token_type",
        revokedAt: "revoked_at",
        expiresAt: "expires_at",
    },
}));

vi.mock("drizzle-orm", () => ({
    and: vi.fn(() => ({})),
    eq: vi.fn(() => ({})),
    gt: vi.fn(() => ({})),
    isNull: vi.fn(() => ({})),
}));

import { db } from "@services/dbService";
import { authMiddleware } from "@middleware/authMiddleware";

type ResMock = Response & {
    statusCode: number;
    body?: unknown;
    headers: Record<string, string>;
};

function createReq(authorization?: string): Request {
    const headers: Record<string, string> = {};
    if (authorization) {
        headers.authorization = authorization;
    }

    return {
        method: "GET",
        url: "/v1/auth/me",
        ip: "127.0.0.1",
        get(name: string) {
            return headers[name.toLowerCase()];
        },
    } as unknown as Request;
}

function createRes(): ResMock {
    const res = {
        statusCode: 0,
        body: undefined,
        headers: {} as Record<string, string>,
        status(code: number) {
            this.statusCode = code;
            return this;
        },
        json(payload: unknown) {
            this.body = payload;
            return this;
        },
        setHeader(key: string, value: string) {
            this.headers[key.toLowerCase()] = value;
        },
    };

    return res as unknown as ResMock;
}

function mockTokenLookup(rows: Array<{ userId: string }>) {
    (db.select as any).mockReturnValueOnce({
        from: () => ({
            where: () => ({
                limit: () => Promise.resolve(rows),
            }),
        }),
    });
}

describe("authMiddleware", () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    test("returns 401 when bearer token is missing", async () => {
        const req = createReq();
        const res = createRes();
        const next = vi.fn() as unknown as NextFunction;

        await authMiddleware()(req, res, next);

        expect(res.statusCode).toBe(401);
        expect(res.body).toEqual({ error: "UNAUTHORIZED" });
        expect(next).not.toHaveBeenCalled();
    });

    test("attaches req.auth and calls next for valid access token", async () => {
        mockTokenLookup([{ userId: "user-123" }]);

        const req = createReq("Bearer valid-access-token");
        const res = createRes();
        const next = vi.fn() as unknown as NextFunction;

        await authMiddleware()(req, res, next);

        expect((req as any).auth).toEqual({ userId: "user-123" });
        expect(next).toHaveBeenCalledTimes(1);
        expect(res.statusCode).toBe(0);
    });

    test("returns 401 when token lookup finds no active access token", async () => {
        mockTokenLookup([]);

        const req = createReq("Bearer stale-token");
        const res = createRes();
        const next = vi.fn() as unknown as NextFunction;

        await authMiddleware()(req, res, next);

        expect(res.statusCode).toBe(401);
        expect(res.body).toEqual({ error: "UNAUTHORIZED" });
        expect(next).not.toHaveBeenCalled();
    });
});

