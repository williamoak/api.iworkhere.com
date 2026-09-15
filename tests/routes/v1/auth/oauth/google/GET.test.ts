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

vi.mock("@helpers/config", () => ({
  config: {
    APP_URL: "https://bill.iworkhere.com",
  },
  configGet: vi.fn().mockReturnValue(false),
  getGoogleOAuthConfig: vi.fn().mockReturnValue({
    authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    clientId: "client-id",
    redirectUri: "http://localhost:4300/v1/auth/oauth/google/callback",
  }),
}));

import GET from "@routes/v1/auth/oauth/google/GET";
import { resolveApplicationFromRequest, getCallerOrigin } from "@services/auth/applicationOriginResolver";
import { signState } from "@services/auth/oauthStateService";
import { config } from "@helpers/config";

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

  it("uses caller origin directly when redirect_uri is missing and caller origin exists", async () => {
    vi.mocked(resolveApplicationFromRequest).mockResolvedValue({
      applicationId: "app-123",
      applicationKey: "bill.iworkhere.com",
    });
    vi.mocked(getCallerOrigin).mockReturnValue("https://custom-caller.iworkhere.com");

    const req = { query: {} } as unknown as Request;
    const res = createRes();

    await GET(req, res);

    expect(signState).toHaveBeenCalledWith(
      "bill.iworkhere.com",
      "https://custom-caller.iworkhere.com",
      "redirect"
    );
    expect(res.statusCode).toBe(302);
  });

  it("uses caller origin when redirect_uri is relative path", async () => {
    vi.mocked(resolveApplicationFromRequest).mockResolvedValue({
      applicationId: "app-123",
      applicationKey: "bill.iworkhere.com",
    });
    vi.mocked(getCallerOrigin).mockReturnValue("https://portal.iworkhere.com/");

    const req = {
      query: { redirect_uri: "/dashboard" },
    } as unknown as Request;
    const res = createRes();

    await GET(req, res);

    expect(signState).toHaveBeenCalledWith(
      "bill.iworkhere.com",
      "https://portal.iworkhere.com/dashboard",
      "redirect"
    );
    expect(res.statusCode).toBe(302);
  });

  it("handles getCallerOrigin error and falls back to APP_URL", async () => {
    vi.mocked(resolveApplicationFromRequest).mockResolvedValue({
      applicationId: "app-123",
      applicationKey: "bill.iworkhere.com",
    });
    vi.mocked(getCallerOrigin).mockImplementation(() => {
      throw new Error("Invalid origin");
    });

    const req = { query: {} } as unknown as Request;
    const res = createRes();

    await GET(req, res);

    expect(signState).toHaveBeenCalledWith(
      "bill.iworkhere.com",
      "https://bill.iworkhere.com",
      "redirect"
    );
    expect(res.statusCode).toBe(302);
  });

  it("falls back to APP_URL when no caller origin is available", async () => {
    vi.mocked(resolveApplicationFromRequest).mockResolvedValue({
      applicationId: "app-123",
      applicationKey: "bill.iworkhere.com",
    });
    vi.mocked(getCallerOrigin).mockReturnValue(undefined);

    const req = { query: {} } as unknown as Request;
    const res = createRes();

    await GET(req, res);

    expect(signState).toHaveBeenCalledWith(
      "bill.iworkhere.com",
      "https://bill.iworkhere.com",
      "redirect"
    );
  });

  it("leaves redirect_uri undefined when both origin fallbacks are unavailable", async () => {
    vi.mocked(resolveApplicationFromRequest).mockResolvedValue({
      applicationId: "app-123",
      applicationKey: "bill.iworkhere.com",
    });
    vi.mocked(getCallerOrigin).mockReturnValue(undefined);
    const originalAppUrl = config.APP_URL;
    delete config.APP_URL;

    try {
      const req = { query: {} } as unknown as Request;
      const res = createRes();

      await GET(req, res);

      expect(signState).toHaveBeenCalledWith("bill.iworkhere.com", undefined, "redirect");
    } finally {
      config.APP_URL = originalAppUrl;
    }
  });

  it("leaves redirect_uri undefined when origin resolution fails without APP_URL", async () => {
    vi.mocked(resolveApplicationFromRequest).mockResolvedValue({
      applicationId: "app-123",
      applicationKey: "bill.iworkhere.com",
    });
    vi.mocked(getCallerOrigin).mockImplementation(() => {
      throw new Error("Invalid origin");
    });
    const originalAppUrl = config.APP_URL;
    delete config.APP_URL;

    try {
      const req = { query: {} } as unknown as Request;
      const res = createRes();

      await GET(req, res);

      expect(signState).toHaveBeenCalledWith("bill.iworkhere.com", undefined, "redirect");
    } finally {
      config.APP_URL = originalAppUrl;
    }
  });

  it("uses APP_URL to expand a relative redirect when caller origin is unavailable", async () => {
    vi.mocked(resolveApplicationFromRequest).mockResolvedValue({
      applicationId: "app-123",
      applicationKey: "bill.iworkhere.com",
    });
    vi.mocked(getCallerOrigin).mockReturnValue(undefined);

    const req = { query: { redirect_uri: "/mobile/callback" } } as unknown as Request;
    const res = createRes();

    await GET(req, res);

    expect(signState).toHaveBeenCalledWith(
      "bill.iworkhere.com",
      "https://bill.iworkhere.com/mobile/callback",
      "redirect"
    );
  });

  it("does not expand a relative redirect when no base origin exists", async () => {
    vi.mocked(resolveApplicationFromRequest).mockResolvedValue({
      applicationId: "app-123",
      applicationKey: "bill.iworkhere.com",
    });
    vi.mocked(getCallerOrigin).mockReturnValue(undefined);
    const originalAppUrl = config.APP_URL;
    delete config.APP_URL;

    try {
      const req = { query: { redirect_uri: "/mobile/callback" } } as unknown as Request;
      const res = createRes();

      await GET(req, res);

      expect(signState).toHaveBeenCalledWith("bill.iworkhere.com", "/mobile/callback", "redirect");
    } finally {
      config.APP_URL = originalAppUrl;
    }
  });

  it("passes undefined redirect_uri to signState for a non-string query value", async () => {
    vi.mocked(resolveApplicationFromRequest).mockResolvedValue({
      applicationId: "app-123",
      applicationKey: "bill.iworkhere.com",
    });

    const req = { query: { redirect_uri: ["/one", "/two"] } } as unknown as Request;
    const res = createRes();

    await GET(req, res);

    expect(signState).toHaveBeenCalledWith("bill.iworkhere.com", undefined, "redirect");
  });
});
