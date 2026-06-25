import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

vi.mock("@services/auth/applicationOriginResolver", () => ({
  __esModule: true,
  resolveApplicationFromRequest: vi.fn(),
  getCallerOrigin: vi.fn(),
  normalizeOrigin: vi.fn(),
}));

vi.mock("@services/auth/oauthStateService", () => ({
  __esModule: true,
  signState: vi.fn(),
}));

import GET from "@routes/v1/auth/oauth/google/GET";
import { resolveApplicationFromRequest } from "@services/auth/applicationOriginResolver";
import { signState } from "@services/auth/oauthStateService";

type ResMock = Response & {
  statusCode: number;
  redirectUrl: string;
};

function createRes(): ResMock {
  return {
    statusCode: 0,
    redirectUrl: "",
    redirect(code: number, url: string) {
      this.statusCode = code;
      this.redirectUrl = url;
      return this;
    },
  } as ResMock;
}

describe("GET /v1/auth/oauth/google", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to Google with correct parameters", async () => {
    vi.mocked(resolveApplicationFromRequest).mockResolvedValue({
      applicationId: "app-123",
      applicationKey: "bill.iworkhere.com",
    });

    vi.mocked(signState).mockReturnValue("signed-state-xyz");

    const req = { query: {} } as unknown as Request;
    const res = createRes();

    await GET(req, res);

    expect(resolveApplicationFromRequest).toHaveBeenCalledWith(req);
    // Explicitly check for the default "redirect" flow
    expect(signState).toHaveBeenCalledWith("bill.iworkhere.com", "https://bill.iworkhere.com", "redirect");

    expect(res.statusCode).toBe(302);
    expect(res.redirectUrl).toContain("https://accounts.google.com/o/oauth2/v2/auth");
    expect(res.redirectUrl).toContain("state=signed-state-xyz");
  });

  it("passes redirect_uri and flow from query to signState", async () => {
    vi.mocked(resolveApplicationFromRequest).mockResolvedValue({
      applicationId: "app-123",
      applicationKey: "bill.iworkhere.com",
    });

    const req = { 
        query: { redirect_uri: "billapp://auth", flow: "popup" } 
    } as unknown as Request;
    const res = createRes();

    await GET(req, res);

    expect(signState).toHaveBeenCalledWith("bill.iworkhere.com", "billapp://auth", "popup");
    expect(res.statusCode).toBe(302);
  });

  it("defaults to redirect flow when flow query is invalid", async () => {
    vi.mocked(resolveApplicationFromRequest).mockResolvedValue({
      applicationId: "app-123",
      applicationKey: "bill.iworkhere.com",
    });

    const req = { 
        query: { flow: "invalid-flow" } 
    } as unknown as Request;
    const res = createRes();

    await GET(req, res);

    expect(signState).toHaveBeenCalledWith("bill.iworkhere.com", "https://bill.iworkhere.com", "redirect");
    expect(res.statusCode).toBe(302);
  });
});
