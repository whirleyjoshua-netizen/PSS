import { beforeEach, describe, expect, it, vi } from "vitest";

const constructed: unknown[] = [];
vi.mock("google-auth-library", () => ({
  GoogleAuth: vi.fn(function (this: { opts: unknown; getAccessToken: () => Promise<string> }, opts: unknown) {
    constructed.push(opts);
    this.opts = opts;
    this.getAccessToken = async () => "abc";
  }),
}));

import { resetRouteAuthForTests, routeAccessToken } from "@/lib/routes/google-auth";

beforeEach(() => {
  resetRouteAuthForTests();
  constructed.length = 0;
  vi.unstubAllEnvs();
});

describe("routeAccessToken", () => {
  it("builds GoogleAuth from the service account JSON with the cloud-platform scope", async () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON", '{"client_email":"a@b.iam","private_key":"k"}');
    await expect(routeAccessToken()).resolves.toBe("abc");
    expect(constructed).toEqual([{
      credentials: { client_email: "a@b.iam", private_key: "k" },
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    }]);
  });

  it("rejects when the service account is not valid JSON", async () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON", "not json");
    await expect(routeAccessToken()).rejects.toThrow("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON");
  });
});
