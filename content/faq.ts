import { business } from "@/content/business";
import { LEAD_TIME_LINE, LEAD_TIME_START } from "@/content/consultation";
import { guides } from "@/content/guides";
import { MOTORIZED_EXTRA_WEEKS } from "@/content/lead-times";
import { SERVICE_VISIT_DOLLARS } from "@/lib/docs/starter-terms";
import { WARRANTY } from "@/content/warranty";
import { cityPath } from "@/lib/content/cities";

/**
 * The /faq page, "Questions and answers" (owner + consultant, 2026-10-13).
 *
 * The consultant's 24 questions and grouping, answered with what is true of this business. Every fact here
 * comes from a file the rest of the site already reads, so the FAQ can never promise more than the product
 * pages, the consultation page or the contract:
 *   content/consultation.ts  free consult, samples, Josh measures, the measurement guarantee, lead time on
 *                            the quote, temporary shades, takedown priced per window, free haul-away
 *   content/lead-times.ts    the weeks (through LEAD_TIME_LINE), counted from the day you order
 *   content/warranty.ts      the only warranty wording allowed
 *   lib/docs/starter-terms.ts §6 the new price before anything is ordered; §8 the motorized week (through
 *                            MOTORIZED_EXTRA_WEEKS); §13 the service visit after year one (SERVICE_VISIT_DOLLARS)
 *   content/products.ts      every product claim (UV, openness, cells, battery tubes, 70–90%)
 *   content/cities.ts        the local detail
 *   content/guides.ts        the two repair guides
 * Change an answer only when its source says the new thing first.
 *
 * Answers are plain text (they also go into the FAQPage JSON-LD), 40–120 words, and make sense on their own.
 */

export type FaqLink = { label: string; href: string };
export type FaqItem = { q: string; a: string; links?: FaqLink[] };
export type FaqGroup = { id: string; title: string; items: FaqItem[] };

/** When the answers last changed. The sitemap sends it as /faq's lastModified. */
export const FAQ_UPDATED = "2026-10-13";

const capitalized = (line: string) => `${line[0]!.toUpperCase()}${line.slice(1)}`;

const guideLinks: FaqLink[] = guides.map((guide) => ({ label: guide.crumb, href: `/guides/${guide.slug}` }));

const cityList = (() => {
  const names = [...business.serviceArea];
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
})();

export const FAQ_GROUPS: FaqGroup[] = [
  {
    id: "basics",
    title: "Window treatment basics",
    items: [
      {
        q: "What are window treatments?",
        a: "Window treatments are anything that covers a window, inside or out: blinds, shades, shutters and exterior solar screens. They decide how much light, heat and privacy a room gets, and here they do a lot of work. West-facing glass in the Las Vegas valley takes direct sun from about two in the afternoon until sunset. The right treatment turns a room you avoid in July into one you use. We measure, supply and install every kind on this site, custom-made for your windows.",
        links: [
          { label: "Blinds", href: "/blinds" },
          { label: "Shades", href: "/shades" },
          { label: "Shutters", href: "/shutters" },
          { label: "Outdoor shading", href: "/outdoor" },
        ],
      },
      {
        q: "What types of window treatments does Premier Shade Solutions offer?",
        a: "Five kinds, all custom. Blinds: vertical blinds, and wood and faux wood blinds. Shades: roller, solar, cellular, roman, woven wood and transitional. Shutters: plantation shutters in composite or real wood. Outdoor: exterior solar screens that stop the heat before it reaches the glass. And motorization, which puts blinds and shades on an app, a wall remote or a schedule. Every one is made to your measurements and installed by us.",
        links: [
          { label: "Blinds", href: "/blinds" },
          { label: "Shades", href: "/shades" },
          { label: "Shutters", href: "/shutters" },
          { label: "Solar screens", href: "/outdoor/solar-screens" },
          { label: "Motorization", href: "/motorization" },
        ],
      },
      {
        q: "How do I choose the right window treatments for my home?",
        a: "Start with what each room needs to do. Bedrooms usually want darkness: a blackout roller, or a dual roller with a solar screen for daytime and a blackout behind it, the setup we specify most for west-facing bedrooms. Living rooms want glare control without losing the view, which points to a solar shade or a shutter. Kitchens and baths want something that wipes clean, like faux wood. Then the direction each window faces narrows it down. Shade’ walks you through it at your free consultation, with samples in your own light.",
        links: [
          { label: "Roller shades", href: "/shades/roller-shades" },
          { label: "Solar shades", href: "/shades/solar-shades" },
          { label: "Wood and faux wood blinds", href: "/blinds/wood-blinds" },
        ],
      },
      {
        q: "What is the difference between blinds and shades?",
        a: "Blinds are slats or vanes that tilt, so you can keep the light and lose the glare without closing the room off. They wipe clean, which makes them the practical pick for kitchens, baths and home offices. Shades are a single panel of fabric that raises and lowers, and the fabric decides everything: sheer, light filtering, room darkening or true blackout. Shades read softer, and a cellular shade adds real insulation. Shutters are a third option: louvered panels built into the window opening itself.",
        links: [
          { label: "Blinds", href: "/blinds" },
          { label: "Shades", href: "/shades" },
          { label: "Shutters", href: "/shutters" },
        ],
      },
    ],
  },
  {
    id: "pricing",
    title: "Price, measuring and installation",
    items: [
      {
        q: "How much do custom window treatments cost?",
        a: "It depends on your windows, so we don't publish a price list. What moves the price: how many windows, how big they are, the product and fabric you choose, how it operates (cordless, chain or motorized) and any extras. Taking your old blinds down is one of those extras, priced per window on your quote; hauling them away is free. Your quote is free and in writing, so you see every line before you say yes. If the final measure changes a size, the mounting or the product, you hear the new price first, and nothing is ordered until you approve it.",
        links: [{ label: "Invite Us Over", href: "/contact" }],
      },
      {
        q: "Are custom window treatments worth it?",
        a: "For most Las Vegas homes, yes, because fit and fabric are where off-the-shelf goes wrong. Custom is made to your exact openings, including sliding doors and tall great-room glass. The fabric choice, like a solar shade's openness factor, is exactly the decision people get wrong buying online, and we make it with you window by window. And shutters are the one window treatment that reliably adds value at resale instead of wearing out.",
        links: [
          { label: "Solar shades", href: "/shades/solar-shades" },
          { label: "Plantation shutters", href: "/shutters/plantation-shutters" },
        ],
      },
      {
        q: "Do my windows need to be professionally measured?",
        a: "For custom, yes. Your blinds, shades or shutters are built to the numbers we send, so the measurement is the whole job. Josh measures every window himself, and he works out the details there and then, like whether a wide shutter panel needs an extra stile. We stand behind every number. If a measurement is off, we remake it and install it again, free. That is our measurement guarantee.",
        links: [{ label: "Meet the family", href: "/about" }],
      },
      {
        q: "How long does it take to receive and install custom shades?",
        a: `${capitalized(LEAD_TIME_LINE)}, ${LEAD_TIME_START}. Motorized products take about ${MOTORIZED_EXTRA_WEEKS === 1 ? "a week" : `${MOTORIZED_EXTRA_WEEKS} weeks`} longer. Your lead time is written on your quote, so you know before you say yes. Need privacy sooner? We put up temporary shades for free while you wait. On install day we install, walk through every window with you, clean up, and haul your old blinds away free.`,
        links: [{ label: "Invite Us Over", href: "/contact" }],
      },
      {
        q: "Can you install window treatments in an existing home?",
        a: "Yes. We work in homes people live in, from a mid-century ranch with single-pane glass in aluminum frames to a new build near the 215. We protect your floors, clean up and vacuum before we go, and haul your old blinds away for free. If you want us to take the old ones down, that is priced per window on your quote, so there are no surprises on install day.",
        links: [{ label: "Las Vegas", href: cityPath("Las Vegas") }],
      },
    ],
  },
  {
    id: "light",
    title: "Light, privacy and heat",
    items: [
      {
        q: "What window treatments are best for blocking sunlight?",
        a: "For a truly dark room, a blackout roller shade with side channels, which close the light gaps at the edges. That matters in bedrooms and for anyone who sleeps days. Cellular shades come in blackout fabrics too. If you want to cut the sun but keep your view, a solar shade blocks up to 99% of UV and comes in openness factors from 1% to 14%: tighter blocks more heat, more open keeps a crisper view. We choose the openness window by window.",
        links: [
          { label: "Roller shades", href: "/shades/roller-shades" },
          { label: "Solar shades", href: "/shades/solar-shades" },
          { label: "Cellular shades", href: "/shades/cellular-shades" },
        ],
      },
      {
        q: "Do cellular shades help with energy efficiency?",
        a: "Yes. Their honeycomb cells trap a layer of still air against the glass, and that air is real insulation. In a Las Vegas summer it slows heat coming in, not just heat leaking out. On single-pane windows or older aluminum frames, a double-cell shade makes a measurable difference in how hard your air conditioning works in the afternoon. How much you save depends on your windows and which way they face, so we won't promise you a number.",
        links: [{ label: "Cellular shades", href: "/shades/cellular-shades" }],
      },
      {
        q: "Which window treatments are best for Las Vegas heat?",
        a: "Stop the sun before it reaches the glass if you can. Exterior solar screens turn away roughly 70–90% of the sun's heat, and they are the most economical way to treat a whole west or south wall. Inside, solar shades cut heat and glare while keeping the view, cellular shades insulate, and composite shutters won't warp or yellow in direct sun. Motorized shades can close themselves at 2pm every summer afternoon, whether or not anyone is home.",
        links: [
          { label: "Solar screens", href: "/outdoor/solar-screens" },
          { label: "Solar shades", href: "/shades/solar-shades" },
          { label: "Composite shutters", href: "/shutters/composite-shutters" },
          { label: "Motorization", href: "/motorization" },
        ],
      },
      {
        q: "What window treatments provide privacy without making a room too dark?",
        a: "A few good ones. Transitional shades alternate sheer and solid bands, so one shade goes from filtered daylight to full privacy. Top-down bottom-up cellular shades lower from the top for daylight while the bottom half stays private, which we use constantly for front bedrooms and street-side bathrooms. Solar shades keep your view by day; for night privacy we pair one with a blackout on a dual roller. Woven woods need a privacy liner behind them.",
        links: [
          { label: "Transitional shades", href: "/shades/transitional-shades" },
          { label: "Cellular shades", href: "/shades/cellular-shades" },
          { label: "Woven wood shades", href: "/shades/woven-wood-shades" },
        ],
      },
    ],
  },
  {
    id: "motorized",
    title: "Motorized shades",
    items: [
      {
        q: "What are motorized shades?",
        a: "Blinds and shades that move on a motor, from an app or a wall remote. Modern ones run on a rechargeable battery tube, so no electrician, and they install in the same visit as a manual shade. They earn their keep on windows nobody can reach, rooms that should move together, and schedules that beat the sun to the window. More of our Henderson jobs end up motorized than anywhere else we work, because of the tall great-room glass there.",
        links: [
          { label: "Motorization", href: "/motorization" },
          { label: "Henderson", href: cityPath("Henderson") },
        ],
      },
      {
        q: "Can motorized shades connect to a smart-home system?",
        a: "Motorized shades pair to an app or a wall remote and can run on a schedule. Whether they also join your smart-home system depends on the motor and on the system you use, and we would rather not promise a pairing we haven't checked for your home. Tell us what runs your house when we come out, and we will match the motor to it at the consult.",
        links: [{ label: "Motorization", href: "/motorization" }],
      },
      {
        q: "Are motorized shades available with battery power?",
        a: `Yes. Modern motorized shades run on a rechargeable battery tube inside the shade, so there is no wiring and no electrician, and they go up in the same visit as a manual shade. That is why motorizing a hard-to-reach window is no longer a remodel. ${WARRANTY.motor}`,
        links: [{ label: "Motorization", href: "/motorization" }],
      },
      {
        q: "Are motorized shades safe for children and pets?",
        a: "Motorized and cordless shades remove the cords a child or a pet could reach. Roller shades come cordless or motorized, cordless lift is available on wood and faux wood blinds and on roman shades, and shutters have no cords at all. If you have little ones or pets at home, tell us at the consult and we will steer every window toward cordless or motorized options.",
        links: [
          { label: "Motorization", href: "/motorization" },
          { label: "Roller shades", href: "/shades/roller-shades" },
          { label: "Shutters", href: "/shutters" },
        ],
      },
    ],
  },
  {
    id: "ownership",
    title: "Care and long-term ownership",
    items: [
      {
        q: "How do I clean and maintain my window treatments?",
        a: "Dust is the main thing in this valley: fine desert dust settles on slats and works its way into headrails. Dust or vacuum with a soft brush regularly, and check the maker's care instructions before using anything wet on fabric. Blinds wipe clean, and vertical blinds shed dust rather than collecting it. If a cordless cellular shade starts drifting down, a two-minute reset usually fixes it, and a cracked blind slat takes about fifteen minutes to replace.",
        links: guideLinks,
      },
      {
        q: "How long do custom blinds and shades last?",
        a: "A long time, if the product suits the window. What shortens it here is sun. Real wood and vinyl on west-facing windows fade and turn brittle fastest, which is why we put faux wood blinds and composite shutters where the sun hits: both hold up to direct sun without warping or cracking. A cordless shade's spring eventually wears out. Shutters last longest: on a hard west wall, a shutter still looks right in fifteen years when a fabric shade would have been replaced twice.",
        links: [
          { label: "Wood and faux wood blinds", href: "/blinds/wood-blinds" },
          { label: "Plantation shutters", href: "/shutters/plantation-shutters" },
          ...guideLinks,
        ],
      },
      {
        q: "Do custom window treatments come with a warranty?",
        a: `Yes, and on three things. ${WARRANTY.product} ${WARRANTY.motor} ${WARRANTY.install} ${WARRANTY.fineprint} After that first year, a service visit is $${SERVICE_VISIT_DOLLARS}. Parts the manufacturer's warranty covers are free, so you pay only for our labor; any other parts are extra, and we quote the cost before doing any work.`,
      },
    ],
  },
  {
    id: "working-with-us",
    title: "Working with us",
    items: [
      {
        q: "Do you offer consultations for custom window treatments?",
        a: "Yes, free and with no obligation. We come to your home and bring samples, so you see every color and fabric in your own light, and Josh measures every window himself. You get a written quote with your lead time on it. There is no call center and no sales rep to chase: you text the owners, Shade’ and Josh, directly.",
        links: [
          { label: "Invite Us Over", href: "/contact" },
          { label: "Meet the family", href: "/about" },
        ],
      },
      {
        q: "What areas does Premier Shade Solutions serve?",
        a: `The Las Vegas valley: ${cityList}. Each area has its own page with what we see there most, like Summerlin's west-facing view windows or the tall great-room glass in Henderson. If you are in the valley and your area isn't listed, call anyway, and we will tell you honestly whether we can get to you.`,
        links: business.serviceArea.map((city) => ({ label: city, href: cityPath(city) })),
      },
      {
        q: "Can I get custom shades for large windows or sliding glass doors?",
        a: "Yes. Sliding doors are the hardest openings in most Las Vegas homes, and vertical blinds are still the most sensible answer: the vanes stack to one side so the door still works as a door, and they tilt to block the low western sun. Cellular shades stack small, which keeps tall windows usable, and motorization handles glass too high to reach. On very wide openings composite shutter panels get heavy, so we plan the layout at the measurement, not after the order.",
        links: [
          { label: "Vertical blinds", href: "/blinds/vertical-blinds" },
          { label: "Cellular shades", href: "/shades/cellular-shades" },
          { label: "Motorization", href: "/motorization" },
        ],
      },
      {
        q: "How do I get started with Premier Shade Solutions?",
        a: "Invite us over. Fill in the short form or give us a call, and we will set a time to come to you. We bring samples and help you choose, and Josh measures every window. You get a written quote with your lead time on it. On install day we install, walk through every window with you, clean up, and haul your old blinds away free.",
        links: [{ label: "Invite Us Over", href: "/contact" }],
      },
    ],
  },
];

export const FAQ_ITEMS: FaqItem[] = FAQ_GROUPS.flatMap((group) => group.items);
