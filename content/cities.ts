/**
 * Service-area landing pages.
 *
 * Every city here gets genuinely different copy — real neighborhoods, real
 * housing stock, a climate note specific to that area. Spun near-duplicates of
 * one template are treated as doorway pages and penalized, and tests/routes/
 * cities.test.ts fails if two cities end up saying the same thing.
 */

export type City = {
  slug: string;
  name: string;
  /**
   * The page's own opening line beside the promise badges, in place of the
   * family line every page used to repeat (SEO audit 2026-10-13). Names the city
   * and draws only on facts already in this entry.
   */
  opening: string;
  intro: string[];
  neighborhoods: string[];
  climateNote: string;
  /** What we install most here, each with why it suits this city, drawn from this entry and content/products.ts. */
  popularProducts: { name: string; href: string; why: string }[];
  seo: { title: string; description: string };
};

export const cities: City[] = [
  {
    slug: "las-vegas",
    name: "Las Vegas",
    opening:
      "In Las Vegas we see everything from single-pane glass in aluminum frames, where an insulating cellular shade earns its cost back in a single summer, to big new windows where the job is glare and UV.",
    intro: [
      "Las Vegas proper is the most varied housing stock in the valley. A mid-century ranch off Maryland Parkway, a 1990s tract home in the southwest, and a new build near the 215 need three genuinely different answers, because their windows are three different sizes in three different frames.",
      "In older parts of the city we are often working with single-pane glass in aluminum frames, where an insulating cellular shade earns its cost back in a single summer. In newer construction the glass is bigger and better, and the problem shifts from heat loss to glare and UV — which is a solar shade or a shutter conversation instead.",
    ],
    neighborhoods: [
      "The Lakes",
      "Spring Valley",
      "Centennial Hills",
      "Rhodes Ranch",
      "Southern Highlands",
      "Downtown and the Arts District",
    ],
    climateNote:
      "Central Las Vegas mixes older single-pane windows with new large-format glass, so the right treatment varies more here than anywhere else in the valley — insulation matters in the older stock, glare and UV control in the newer.",
    popularProducts: [
      { name: "Cellular Shades", href: "/shades/cellular-shades", why: "For single-pane glass in older aluminum frames, where the insulation earns its cost back in a single summer." },
      { name: "Solar Shades", href: "/shades/solar-shades", why: "For the bigger, newer glass, where the problem shifts from heat loss to glare and UV." },
      { name: "Plantation Shutters", href: "/shutters/plantation-shutters", why: "Also for newer glass: the louvers tilt to send low afternoon sun up toward the ceiling instead of into your eyes." },
    ],
    seo: {
      title: "Window Treatments in Las Vegas, NV | Premier Shade Solutions",
      description:
        "Custom blinds, shades, and shutters in Las Vegas, NV: insulating shades for older single-pane windows, solar shades for new glass. Free in-home consultation.",
    },
  },
  {
    slug: "henderson",
    name: "Henderson",
    opening:
      "In Henderson the windows run tall, so more of our jobs here end up motorized than anywhere else we work, and shading the covered patio comes up constantly.",
    intro: [
      "Henderson is newer construction on the whole, and it shows up in the windows: larger openings, more sliding doors onto covered patios, and more two-story great rooms with glass that reaches well above where anyone can comfortably stand.",
      "That combination is why more Henderson jobs end up motorized than anywhere else we work. A shade fourteen feet up gets operated exactly as often as it is easy to operate, and a hand crank is not easy. It is also why patio shading comes up constantly here — the covered patio is the point of the house, and in July it is unusable without it.",
    ],
    neighborhoods: [
      "Anthem",
      "Green Valley",
      "Seven Hills",
      "Inspirada",
      "MacDonald Highlands",
      "Cadence",
    ],
    climateNote:
      "Henderson's newer homes bring taller windows and bigger sliders than the rest of the valley, which makes motorization and solar screens the two upgrades that come up most often here.",
    popularProducts: [
      { name: "Motorization", href: "/motorization", why: "For two-story great rooms, where a shade fourteen feet up only gets used if it is easy to operate." },
      { name: "Solar Screens", href: "/outdoor/solar-screens", why: "For the bigger sliders: fixed screens turn away roughly 70–90% of the sun's heat before it reaches the glass." },
      { name: "Roller Shades", href: "/shades/roller-shades", why: "One clean line of fabric across the larger openings, with motorized operation when the window is out of reach." },
    ],
    seo: {
      title: "Window Treatments in Henderson, NV | Premier Shade Solutions",
      description:
        "Custom blinds, shades, shutters, and motorized treatments in Henderson, NV. Free in-home consultation and owner installation.",
    },
  },
  {
    slug: "summerlin",
    name: "Summerlin",
    opening:
      "In Summerlin we specify solar screen shades for your west-facing view windows, so you cut the afternoon heat and glare without giving up the Red Rock view, and we work within your village's HOA guidelines.",
    intro: [
      "Summerlin sits up against the western edge of the valley, and that geography defines the work. Homes here are oriented to take in the Red Rock views, which means large west-facing glass — and west-facing glass in this valley absorbs everything the sun has left from two in the afternoon until it drops behind the escarpment.",
      "The design problem is specific and it is not a trivial one: how do you kill that heat and glare without giving up the view you paid for? Our answer here is usually a solar screen shade specified to the exposure, often layered with a blackout on a dual roller for bedrooms. It keeps the view during the day and gives you a genuinely dark room at night.",
      "Many Summerlin villages also have HOA guidelines covering what is visible from the street. We work within them, and it is worth checking before ordering anything exterior.",
    ],
    neighborhoods: [
      "The Ridges",
      "Summerlin South",
      "The Trails",
      "The Vistas",
      "Red Rock Country Club",
      "Summerlin Centre",
    ],
    climateNote:
      "Summerlin's west-facing view windows take the hardest afternoon sun in the valley, so the whole design problem here is cutting heat and glare without giving up the Red Rock view you bought the house for.",
    popularProducts: [
      { name: "Solar Shades", href: "/shades/solar-shades", why: "For the west-facing view windows: they cut the afternoon heat and glare and keep the Red Rock view." },
      { name: "Roller Shades", href: "/shades/roller-shades", why: "For bedrooms we often layer a blackout behind the solar screen on a dual roller, for a genuinely dark room at night." },
      { name: "Plantation Shutters", href: "/shutters/plantation-shutters", why: "The louvers tilt to send the low afternoon sun up toward the ceiling instead of into your eyes." },
    ],
    seo: {
      title: "Window Treatments in Summerlin, NV | Premier Shade Solutions",
      description:
        "Solar shades, shutters, and motorized treatments for Summerlin, NV. Keep the Red Rock view, lose the afternoon heat and glare.",
    },
  },
  {
    slug: "north-las-vegas",
    name: "North Las Vegas",
    opening:
      "North Las Vegas homes tend to have consistent window sizes, so we often quote the whole house at once, which brings the price per window down.",
    intro: [
      "North Las Vegas has grown quickly, and much of the housing is recent subdivision construction — consistent window sizes, standard openings, and a lot of homes that were handed over with builder-grade blinds or nothing at all.",
      "That makes it a straightforward whole-home job more often than anywhere else we work. When the openings are consistent, covering an entire house at once is genuinely more efficient than doing it a room at a time, and the price per window comes down accordingly. It is worth asking us to quote the whole house even if you were only planning to do the front rooms.",
      "The open northern exposure also means less shade from mature trees than in older parts of the valley, so afternoon heat gain tends to be higher than homeowners expect.",
    ],
    neighborhoods: [
      "Aliante",
      "Eldorado",
      "Sunrise Manor",
      "Tule Springs",
      "Valley Vista",
    ],
    climateNote:
      "North Las Vegas subdivisions have consistent window sizes and little mature tree cover, which makes whole-home packages efficient here and afternoon heat gain higher than most homeowners expect.",
    popularProducts: [
      { name: "Faux Wood Blinds", href: "/blinds/wood-blinds", why: "A practical whole-home choice: faux wood will not warp, fade or crack in direct desert sun." },
      { name: "Cellular Shades", href: "/shades/cellular-shades", why: "With little mature tree cover, afternoon heat gain runs high, and the trapped air in a cellular shade slows heat coming in." },
      { name: "Solar Screens", href: "/outdoor/solar-screens", why: "For the west side of the house, where screens take a real bite out of a summer power bill." },
    ],
    seo: {
      title: "North Las Vegas Window Treatments | Premier Shade Solutions",
      description:
        "Custom blinds, shades, and shutters in North Las Vegas, NV, with whole-home packages for consistent subdivision windows. Free in-home consultation.",
    },
  },
];
