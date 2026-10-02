import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isPromoLive, promoHideScript, promoStorageKey, type Promo } from "@/lib/promo";
import { holidayPromo } from "@/content/promo";

const promo: Promo = {
  id: "test-promo",
  message: "Long message",
  shortMessage: "Short",
  cta: "Book →",
  shortCta: "Book →",
  href: "/contact",
  startsAt: "2026-10-01T00:00:00-07:00",
  endsAt: "2026-12-25T00:00:00-08:00",
};

describe("isPromoLive", () => {
  it("is live from the start instant", () => {
    expect(isPromoLive(promo, new Date("2026-10-01T07:00:00Z"))).toBe(true);
  });

  it("is not live a moment before the start", () => {
    expect(isPromoLive(promo, new Date("2026-10-01T06:59:59Z"))).toBe(false);
  });

  it("is live through the last minute of Dec 24 in Las Vegas", () => {
    expect(isPromoLive(promo, new Date("2026-12-25T07:59:59Z"))).toBe(true);
  });

  it("ends at midnight Dec 25 Las Vegas time", () => {
    expect(isPromoLive(promo, new Date("2026-12-25T08:00:00Z"))).toBe(false);
  });
});

describe("the holiday promo", () => {
  it("ends at the close of Dec 24, Las Vegas time", () => {
    expect(new Date(holidayPromo.endsAt).toISOString()).toBe("2026-12-25T08:00:00.000Z");
  });

  it("sends visitors to the consultation form", () => {
    expect(holidayPromo.href).toBe("/contact");
  });
});

describe("promoHideScript", () => {
  const run = (now: string) => {
    const realNow = Date.now;
    Date.now = () => new Date(now).getTime();
    try {
      new Function(promoHideScript(promo))();
    } finally {
      Date.now = realNow;
    }
  };
  const hidden = () =>
    Array.from(document.head.querySelectorAll("style")).some((style) =>
      style.textContent?.includes('[data-promo="test-promo"]'),
    );

  beforeEach(() => {
    window.localStorage.clear();
    document.head.innerHTML = "";
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it("leaves the banner showing inside the window for a new visitor", () => {
    run("2026-11-01T12:00:00Z");
    expect(hidden()).toBe(false);
  });

  it("hides the banner for a visitor who closed it", () => {
    window.localStorage.setItem(promoStorageKey(promo), "1");
    run("2026-11-01T12:00:00Z");
    expect(hidden()).toBe(true);
  });

  it("does not hide a promo the visitor never closed when they closed another", () => {
    window.localStorage.setItem(promoStorageKey({ ...promo, id: "last-year" }), "1");
    run("2026-11-01T12:00:00Z");
    expect(hidden()).toBe(false);
  });

  it("hides the banner after the end, even on a page built before it", () => {
    run("2026-12-25T08:00:00Z");
    expect(hidden()).toBe(true);
  });

  it("hides the banner before the start", () => {
    run("2026-09-30T12:00:00Z");
    expect(hidden()).toBe(true);
  });

  it("still shows the banner when storage is blocked", () => {
    const getItem = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error("blocked");
    };
    try {
      run("2026-11-01T12:00:00Z");
    } finally {
      Storage.prototype.getItem = getItem;
    }
    expect(hidden()).toBe(false);
  });

  it("cannot be broken out of by the promo's own text", () => {
    expect(promoHideScript({ ...promo, id: "</script><script>alert(1)" })).not.toContain("</script>");
  });
});
