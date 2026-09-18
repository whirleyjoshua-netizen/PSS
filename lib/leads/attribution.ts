import { z } from "zod";

/**
 * Which ad, if any, brought a visitor to the site.
 *
 * Google Ads auto-tagging appends ?gclid= (or gbraid/wbraid on iOS) to every ad
 * click. The visitor rarely fills the form on the page they land on, so the
 * click is kept in the browser and sent with the form later. Stored on the lead,
 * the gclid lets a booked or sold job be uploaded back to Google Ads as a
 * conversion — which is how the campaign learns which searches produce customers.
 */
export const ATTRIBUTION_KEY = "pss-ad-click";

/** Google accepts an offline conversion up to 90 days after its click. */
export const ATTRIBUTION_DAYS = 90;

const text = (max: number) => z.string().trim().min(1).max(max).optional().catch(undefined);

export const attributionSchema = z.object({
  gclid: text(200),
  gbraid: text(200),
  wbraid: text(200),
  utmSource: text(100),
  utmMedium: text(100),
  utmCampaign: text(150),
  utmTerm: text(150),
  landingPage: text(300),
  /** ISO time of the click, so a stale one can be dropped. */
  clickedAt: z.string().datetime().optional().catch(undefined),
});

export type Attribution = z.infer<typeof attributionSchema>;

const PARAMS = {
  gclid: "gclid",
  gbraid: "gbraid",
  wbraid: "wbraid",
  utmSource: "utm_source",
  utmMedium: "utm_medium",
  utmCampaign: "utm_campaign",
  utmTerm: "utm_term",
} as const;

/** The click carried by a landing URL, or null when it carries none. */
export function attributionFromUrl(href: string, now = new Date()): Attribution | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const found: Record<string, string> = {};
  for (const [key, param] of Object.entries(PARAMS)) {
    const value = url.searchParams.get(param);
    if (value) found[key] = value;
  }
  if (Object.keys(found).length === 0) return null;
  return attributionSchema.parse({ ...found, landingPage: url.pathname, clickedAt: now.toISOString() });
}

type Store = Pick<Storage, "getItem" | "setItem">;

/** Keeps the newest click: Google credits the last ad clicked before converting. */
export function rememberAttribution(storage: Store, href: string, now = new Date()): void {
  const click = attributionFromUrl(href, now);
  if (click) storage.setItem(ATTRIBUTION_KEY, JSON.stringify(click));
}

/** The remembered click, or undefined when there is none or it is past Google's window. */
export function recallAttribution(storage: Store, now = new Date()): Attribution | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(storage.getItem(ATTRIBUTION_KEY) ?? "null");
  } catch {
    return undefined;
  }
  const parsed = attributionSchema.safeParse(raw);
  if (!raw || !parsed.success || !parsed.data.clickedAt) return undefined;
  const age = now.getTime() - new Date(parsed.data.clickedAt).getTime();
  return age <= ATTRIBUTION_DAYS * 86_400_000 ? parsed.data : undefined;
}

/** "Google Ads · Custom Blinds in Las Vegas" for the job page, or null for an unpaid visit. */
export function adClickLabel(click: Attribution | null | undefined): string | null {
  if (!click) return null;
  const paid = click.gclid || click.gbraid || click.wbraid;
  const source = paid ? "Google Ads" : click.utmSource;
  if (!source) return null;
  return [source, click.utmCampaign, click.utmTerm ? `“${click.utmTerm}”` : null].filter(Boolean).join(" · ");
}
