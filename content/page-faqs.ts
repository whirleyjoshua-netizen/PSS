import { FAQ_GROUPS, type FaqItem } from "./faq";

/**
 * Which /faq answers each product, category and city page repeats (owner 2026-10-21, technical SEO plan: FAQ
 * sections on the pages people land on). Only questions already answered in content/faq.ts, chosen by their exact
 * wording, so a page can never say more than /faq does. A question that is renamed there fails the tests here.
 */
const LEAD_TIME = "How long does it take to receive and install custom shades?";
const WARRANTY = "Do custom window treatments come with a warranty?";
const CONSULT = "Do you offer consultations for custom window treatments?";
const BLINDS_VS_SHADES = "What is the difference between blinds and shades?";
const BLOCK_SUN = "What window treatments are best for blocking sunlight?";
const HEAT = "Which window treatments are best for Las Vegas heat?";
const PRIVACY = "What window treatments provide privacy without making a room too dark?";
const ENERGY = "Do cellular shades help with energy efficiency?";
const BIG_WINDOWS = "Can I get custom shades for large windows or sliding glass doors?";
const LAST = "How long do custom blinds and shades last?";
const CLEAN = "How do I clean and maintain my window treatments?";
const SAFE = "Are motorized shades safe for children and pets?";
const WORTH = "Are custom window treatments worth it?";
const EXISTING = "Can you install window treatments in an existing home?";
const AREAS = "What areas does Premier Shade Solutions serve?";
const INSURED = "Are you insured?";
const MEASURED = "Do my windows need to be professionally measured?";

const SHUTTERS = [WORTH, LAST, HEAT, LEAD_TIME];

/** Keyed by the page's path, without the leading slash. */
export const PAGE_FAQS: Record<string, readonly string[]> = {
  blinds: [BLINDS_VS_SHADES, BIG_WINDOWS, LAST, LEAD_TIME],
  "blinds/vertical-blinds": [BIG_WINDOWS, CLEAN, LEAD_TIME, WARRANTY],
  "blinds/wood-blinds": [LAST, SAFE, CLEAN, LEAD_TIME],
  shades: [BLINDS_VS_SHADES, BLOCK_SUN, PRIVACY, LEAD_TIME],
  "shades/roller-shades": [BLOCK_SUN, SAFE, LEAD_TIME, WARRANTY],
  "shades/solar-shades": [HEAT, BLOCK_SUN, PRIVACY, LEAD_TIME],
  "shades/cellular-shades": [ENERGY, PRIVACY, BIG_WINDOWS, LEAD_TIME],
  "shades/roman-shades": [SAFE, CLEAN, LEAD_TIME, WARRANTY],
  "shades/woven-wood-shades": [PRIVACY, CLEAN, LEAD_TIME, WARRANTY],
  "shades/transitional-shades": [PRIVACY, BLINDS_VS_SHADES, LEAD_TIME, WARRANTY],
  "shades/sheer-shades": [PRIVACY, BLOCK_SUN, MEASURED, LEAD_TIME],
  shutters: SHUTTERS,
  // Measuring and install first: Google tests this page for "plantation shutter installation" (SEO audit 2026-10-27).
  "shutters/plantation-shutters": [MEASURED, LEAD_TIME, EXISTING, WORTH, HEAT],
  "shutters/composite-shutters": SHUTTERS,
  "shutters/wood-shutters": SHUTTERS,
  "shutters/sliding-door-shutters": [MEASURED, LEAD_TIME, HEAT, WORTH],
  outdoor: [HEAT, EXISTING, LEAD_TIME, WARRANTY],
  "outdoor/solar-screens": [HEAT, EXISTING, LEAD_TIME, WARRANTY],
  motorization: [
    "What are motorized shades?",
    "Are motorized shades available with battery power?",
    "Can motorized shades connect to a smart-home system?",
    SAFE,
  ],
  "service-area/las-vegas": [CONSULT, AREAS, EXISTING, LEAD_TIME, INSURED],
  "service-area/henderson": [CONSULT, AREAS, EXISTING, LEAD_TIME, INSURED],
  "service-area/summerlin": [CONSULT, AREAS, EXISTING, LEAD_TIME, INSURED],
  "service-area/north-las-vegas": [CONSULT, AREAS, EXISTING, LEAD_TIME, INSURED],
};

const ALL: FaqItem[] = FAQ_GROUPS.flatMap((group) => group.items);

/** The answers for a page, in the order listed. Throws on a question /faq no longer asks. */
export function faqsFor(path: string): FaqItem[] {
  return (PAGE_FAQS[path] ?? []).map((q) => {
    const item = ALL.find((candidate) => candidate.q === q);
    if (!item) throw new Error(`No /faq answer for "${q}" (${path})`);
    return item;
  });
}
