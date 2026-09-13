import { describe, it, expect } from "vitest";
import { config } from "@/proxy";

// This Next version has no proxy-matching test helper in its docs
// (`unstable_doesProxyMatch` / `unstable_doesMiddlewareMatch` do not exist),
// so the second matcher's parenthesized group is compiled into a RegExp the
// same way Next does: anchored to "/admin/" and the end of the path.
const group = (config.matcher[1] as string).slice("/admin/".length);
const pattern = new RegExp("^/admin/" + group + "$");

const UUID = "3f2b8c1e-8c52-4a53-9a1c-1d2e3f4a5b6c";

describe("proxy matcher", () => {
  it("matches admin pages", () => {
    expect(pattern.test(`/admin/jobs/${UUID}`)).toBe(true);
    expect(pattern.test(`/admin/jobs/${UUID}/measure`)).toBe(true);
    expect(pattern.test("/admin/settings")).toBe(true);
    expect(pattern.test("/admin/authors")).toBe(true);
    expect(pattern.test(`/admin/files/${UUID}`)).toBe(true);
  });

  it("does not match sign-in, auth, or the file upload route", () => {
    expect(pattern.test("/admin/sign-in")).toBe(false);
    expect(pattern.test("/admin/auth")).toBe(false);
    expect(pattern.test(`/admin/jobs/${UUID}/files`)).toBe(false);
  });
});
