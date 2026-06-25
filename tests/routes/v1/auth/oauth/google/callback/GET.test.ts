import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const { insertBuilderMock } = vi.hoisted(() => ({
  insertBuilderMock: {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn(),
  },
}));

vi.mock("@helpers/config", () => ({ getGoogleOAuthConfig: vi.fn() }));
vi.mock("@services/auth/oauthStateService", () => ({ verifyState: vi.fn() }));
vi.mock("@services/auth/authContext", () => ({ resolveAuthContext: vi.fn() }));
vi.mock("@services/auth/tokenService", () => ({ issueLoginTokens: vi.fn() }));
vi.mock("@db/schema", () => ({
  userAuthOauth: {
    name: "user_auth_oauth",
    provider: "provider",
    providerAccountId: "providerAccountId",
  },
  users: { name: "users" },
}));
vi.mock("@services/dbService", () => ({
  db: {
    query: {
      userAuthOauth: { findFirst: vi.fn() },
      users: { findFirst: vi.fn() },
    },
    insert: vi.fn().mockReturnValue(insertBuilderMock),
  },
}));

import GET from "@routes/v1/auth/oauth/google/callback/GET";
import { getGoogleOAuthConfig } from "@helpers/config";
import { verifyState } from "@services/auth/oauthStateService";
import { resolveAuthContext } from "@services/auth/authContext";
import { issueLoginTokens } from "@services/auth/tokenService";
import { db } from "@services/dbService";

type ResMock = Response & {
  statusCode: number;
  body: unknown;
  redirectUrl: string;
  sentHtml: string;
  status(code: number): any;
  json(payload: unknown): any;
  redirect(code: number, url: string): any;
  send(html: string): any;
  cookie(name: string, value: string, options?: any): any;
};

function createRes(): ResMock {
  return {
    statusCode: 0,
    body: undefined,
    redirectUrl: "",
    sentHtml: "",
    status(code: number) { this.statusCode = code; return this; },
    json(payload: unknown) { this.body = payload; return this; },
    redirect(code: number, url: string) { this.statusCode = code; this.redirectUrl = url; return this; },
    send(html: string) { this.sentHtml = html; return this; },
    cookie(name: string, value: string, options?: any) { return this; },
  } as ResMock;
}

describe("GET /v1/auth/oauth/google/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    insertBuilderMock.returning.mockResolvedValue([{ userId: "user-123" }]);

    vi.mocked(getGoogleOAuthConfig).mockReturnValue({
      tokenUrl: "https://token.url",
      userInfoUrl: "https://userinfo.url",
      failureRedirectUrl: "/error",
    } as any);

    vi.mocked(issueLoginTokens).mockResolvedValue({
      access: { token: "at", expiresAt: new Date() },
      refresh: { token: "rt", expiresAt: new Date() },
    } as any);

    vi.mocked(fetch).mockImplementation(async (url: any) => {
        if (url === "https://token.url") return { ok: true, json: () => Promise.resolve({ access_token: "at" }) } as any;
        if (url === "https://userinfo.url") return { ok: true, json: () => Promise.resolve({ sub: "s", email: "b@e.c" }) } as any;
    });
  });

  it("returns JSON for standard web flow", async () => {
    vi.mocked(verifyState).mockReturnValue({ app_key: "bill.iworkhere.com" } as any);
    vi.mocked(resolveAuthContext).mockResolvedValue({ applicationId: "app-1", applicationKey: "bill.iworkhere.com" } as any);
    vi.mocked(db.query.userAuthOauth.findFirst).mockResolvedValue({ userId: "u123" } as any);

    const res = createRes();
    await GET({ query: { code: "c", state: "s" } } as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("tokens");
  });

  it("returns HTML for popup flow", async () => {
    vi.mocked(verifyState).mockReturnValue({ app_key: "bill.iworkhere.com", flow: "popup", redirect_uri: "https://bill.iworkhere.com" } as any);
    vi.mocked(resolveAuthContext).mockResolvedValue({ applicationId: "app-1", applicationKey: "bill.iworkhere.com" } as any);
    vi.mocked(db.query.userAuthOauth.findFirst).mockResolvedValue({ userId: "u123" } as any);

    const res = createRes();
    await GET({ query: { code: "c", state: "s" } } as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.sentHtml).toContain("window.opener.postMessage");
    expect(res.sentHtml).toContain("OAUTH_SUCCESS");
  });

  it("redirects for mobile flow using deep links", async () => {
    vi.mocked(verifyState).mockReturnValue({ 
        app_key: "bill.iworkhere.com", 
        redirect_uri: "billapp://auth" 
    } as any);
    vi.mocked(resolveAuthContext).mockResolvedValue({ applicationId: "app-1", applicationKey: "bill.iworkhere.com" } as any);
    vi.mocked(db.query.userAuthOauth.findFirst).mockResolvedValue({ userId: "u123" } as any);

    const res = createRes();
    await GET({ query: { code: "c", state: "s" } } as any, res);

    expect(res.statusCode).toBe(302);
    expect(res.redirectUrl).toContain("billapp://auth");
    expect(res.redirectUrl).toContain("access_token=at");
  });
});
