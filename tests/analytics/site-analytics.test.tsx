import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("next/script", () => ({
  default: ({ id, dangerouslySetInnerHTML }: { id: string; dangerouslySetInnerHTML: { __html: string } }) => (
    <script data-testid={id} dangerouslySetInnerHTML={dangerouslySetInnerHTML} />
  ),
}));
vi.mock("@next/third-parties/google", () => ({
  GoogleAnalytics: ({ gaId }: { gaId: string }) => <span data-testid="ga">{gaId}</span>,
}));

import { ADS_ID, GA_ID, SiteAnalytics, isUntrackedPath } from "@/components/analytics/SiteAnalytics";

const DISABLE = `ga-disable-${GA_ID}`;
const flag = () => (window as unknown as Record<string, unknown>)[DISABLE];

/** Reads the switch while React renders, before any effect of this commit has run. */
let seenDuringRender: unknown;
function RenderProbe() {
  seenDuringRender = flag();
  return null;
}

function at(path: string) {
  pathname = path;
  return render(
    <>
      <SiteAnalytics />
      <RenderProbe />
    </>,
  );
}

beforeEach(() => {
  delete (window as unknown as Record<string, unknown>)[DISABLE];
  seenDuringRender = undefined;
});

describe("isUntrackedPath", () => {
  it("covers the admin app and the customer portal, including their sign-in pages", () => {
    for (const path of [
      "/admin",
      "/admin/jobs/42",
      "/admin/auth",
      "/project",
      "/project/sign-in",
      "/project/auth",
      "/project/abc/service",
    ]) {
      expect(isUntrackedPath(path), path).toBe(true);
    }
  });

  it("leaves every public page tracked, even one whose name merely starts the same", () => {
    for (const path of ["/", "/shutters", "/contact", "/thank-you/all-set", "/projector", "/administer"]) {
      expect(isUntrackedPath(path), path).toBe(false);
    }
  });
});

describe("SiteAnalytics", () => {
  it("loads GA with our measurement ID on a public page and leaves it switched on", () => {
    at("/shutters");
    expect(screen.getByTestId("ga").textContent).toBe("G-HP83GW86YX");
    expect(flag()).toBe(false);
  });

  it("configures the Google Ads tag on a public page, through the gtag GA sets up", () => {
    at("/shutters");
    expect(ADS_ID).toBe("AW-18438614507");
    const script = screen.getByTestId("google-ads-config").innerHTML;
    expect(script).toContain("gtag('config', 'AW-18438614507')");
    expect(script).toContain("window['dataLayer'] = window['dataLayer'] || []");
    expect((window as unknown as Record<string, unknown>)["ga-disable-AW-18438614507"]).toBe(false);
  });

  it("never loads the Google Ads tag on the admin app or the portal", () => {
    for (const path of ["/admin", "/admin/jobs/42", "/project", "/project/sign-in"]) {
      const { unmount } = at(path);
      expect(screen.queryByTestId("google-ads-config"), path).toBeNull();
      expect((window as unknown as Record<string, unknown>)["ga-disable-AW-18438614507"], path).toBe(true);
      unmount();
    }
  });

  it("never loads GA on the admin app or the portal", () => {
    for (const path of ["/admin", "/admin/auth", "/project", "/project/sign-in"]) {
      const { unmount } = at(path);
      expect(screen.queryByTestId("ga"), path).toBeNull();
      expect(flag(), path).toBe(true);
      unmount();
    }
  });

  it("switches GA off before a client-side move into the portal commits", () => {
    const view = at("/");
    expect(flag()).toBe(false);

    // The router pushes the new URL, which GA counts as a page view, before any
    // effect runs, so the switch has to be thrown while the new route renders.
    pathname = "/project/abc";
    view.rerender(
      <>
        <SiteAnalytics />
        <RenderProbe />
      </>,
    );
    expect(seenDuringRender).toBe(true);
    expect(screen.queryByTestId("ga")).toBeNull();
  });

  it("switches GA back on when the visitor returns to the public site", () => {
    const view = at("/admin/jobs");
    expect(flag()).toBe(true);

    pathname = "/contact";
    view.rerender(
      <>
        <SiteAnalytics />
        <RenderProbe />
      </>,
    );
    expect(seenDuringRender).toBe(false);
    expect(screen.getByTestId("ga")).toBeTruthy();
  });
});

describe("root layout", () => {
  it("mounts GA only through SiteAnalytics, so no route gets the tag unguarded", () => {
    const source = readFileSync(path.resolve(import.meta.dirname, "../../app/layout.tsx"), "utf8");
    expect(source).not.toMatch(/GoogleAnalytics/);
    expect(source).not.toMatch(/AW-/);
    expect(source).toMatch(/<SiteAnalytics \/>/);
  });
});
