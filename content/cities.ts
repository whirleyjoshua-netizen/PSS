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
  /**
   * Room-by-room and home-by-home detail for this city (SEO plan 2026-10-21: the city pages competitors rank with
   * run 2,400–3,000 words). DRAFT until the owner approves it: every product claim comes from content/products.ts or
   * content/faq.ts; claims about specific neighborhoods were cut where nobody could confirm them (owner 2026-10-22).
   */
  local: { heading: string; body: string }[];
  seo: { title: string; description: string };
};

export const cities: City[] = [
  {
    slug: "las-vegas",
    name: "Las Vegas",
    opening:
      "In Las Vegas we see everything from single-pane glass in aluminum frames, where an insulating cellular shade does the most good, to big new windows where the job is glare and UV.",
    intro: [
      "Las Vegas proper is the most varied housing stock in the valley. A mid-century ranch off Maryland Parkway, a 1990s tract home in the southwest, and a new build near the 215 need three genuinely different answers, because their windows are three different sizes in three different frames.",
      "In older parts of the city we are often working with single-pane glass in aluminum frames, where an insulating cellular shade slows the heat coming through the glass more than anything else we sell. In newer construction the glass is bigger and better, and the problem shifts from heat loss to glare and UV — which is a solar shade or a shutter conversation instead.",
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
      { name: "Cellular Shades", href: "/shades/cellular-shades", why: "For single-pane glass in older aluminum frames, where the trapped air slows the heat coming through." },
      { name: "Solar Shades", href: "/shades/solar-shades", why: "For the bigger, newer glass, where the problem shifts from heat loss to glare and UV." },
      { name: "Plantation Shutters", href: "/shutters/plantation-shutters", why: "Also for newer glass: the louvers tilt to send low afternoon sun up toward the ceiling instead of into your eyes." },
    ],
    local: [
      {
        heading: "Older homes with single-pane glass",
        body: "Many older homes in Las Vegas still have single-pane glass in aluminum frames. Those windows let summer heat straight through. A double-cell cellular shade traps a layer of still air against the glass, and on single-pane windows it makes a measurable difference in how hard your air conditioning works in the afternoon. For street-facing bedrooms we often make it top-down bottom-up, so the top lets daylight in while the bottom half stays private.",
      },
      {
        heading: "Newer homes with bigger glass",
        body: "In newer construction the glass is bigger and the frames are better, so the job shifts from insulation to glare and UV. On west-facing windows we specify a solar shade by openness factor, window by window: a tight 3% screen turns away the most heat, a 10% screen keeps a crisper view. Patio sliders usually get vertical blinds, because the vanes stack to one side and the door still works as a door.",
      },
      {
        heading: "The rooms that work hardest",
        body: "Bedrooms want real darkness, which in Las Vegas often means a blackout roller with side channels for anyone who sleeps days. Home offices want glare off the screen without losing daylight, which is a solar shade. Kitchens and bathrooms want something that wipes clean and will not warp, which is faux wood. We walk the whole house with you at the consultation, so every room gets what it actually needs instead of one product everywhere.",
      },
    ],
    seo: {
      // Not "Window Treatments in Las Vegas": the homepage owns that search (SEO prompt 3, 2026-10-17).
      title: "Las Vegas Neighborhoods We Serve | Premier Shade Solutions",
      description:
        "Custom blinds, shades, and shutters in Las Vegas, NV: insulating shades for older single-pane windows, solar shades for new glass. Free in-home consultation.",
    },
  },
  {
    slug: "henderson",
    name: "Henderson",
    opening:
      "In Henderson the windows run tall, so motorization is a common conversation here, and shading the covered patio comes up constantly.",
    intro: [
      "Henderson is newer construction on the whole, and it shows up in the windows: larger openings, more sliding doors onto covered patios, and more two-story great rooms with glass that reaches well above where anyone can comfortably stand.",
      "That combination is why motorization comes up so often in Henderson. A shade fourteen feet up gets operated exactly as often as it is easy to operate, and a hand crank is not easy. It is also why patio shading comes up constantly here — the covered patio is the point of the house, and in July it is unusable without it.",
    ],
    neighborhoods: [
      "Anthem",
      "Green Valley",
      "Paradise Hills",
      "Gibson Springs",
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
    local: [
      {
        heading: "Two-story great rooms",
        body: "Many Henderson homes have a great room with glass that runs well above where anyone can reach. A shade that high only gets used if it is easy to use, which is why so many of our Henderson jobs end up motorized. We install Alta's BLISS motorization: open and close every shade from the free app or a remote that runs up to 10 shades, and set timers by the clock or by your local sunrise and sunset. Each motor recharges with a USB-C cable, so there is no wiring and no electrician.",
      },
      {
        heading: "Sliders onto the covered patio",
        body: "Henderson homes tend to have bigger sliding doors onto covered patios, and in July the glass on those doors turns the room behind it into an oven. Exterior solar screens on the patio-facing windows turn away roughly 70–90% of the sun's heat before it reaches the glass. Inside, vertical blinds or a cellular shade on the slider keeps the door working while cutting the glare.",
      },
      {
        heading: "Upgrading builder blinds",
        body: "Many new homes in Henderson come with basic builder blinds, often 2-inch faux wood, or a blinds package chosen at the builder's design studio. They work, but they are rarely matched to the room: the same blind on a west-facing great room and a north-facing bedroom. Upgrading is usually about putting the right product on the windows that take the sun, and we quote it room by room so you can start with the ones that matter most.",
      },
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
    local: [
      {
        heading: "Choosing openness for the view windows",
        body: "Summerlin homes face the Red Rock views, which means big west-facing glass taking the hardest afternoon sun in the valley. The choice that matters is the solar shade's openness factor. A 1–3% screen turns away the most heat and UV with a softer view; a 5–10% screen keeps the mountains crisp but lets more energy through. We choose it window by window at the consultation, with samples held up to your own glass at the time of day you use the room.",
      },
      {
        heading: "Bedrooms that face the sunset",
        body: "A west-facing Summerlin bedroom needs two things: a view during the day and real darkness at night. A dual roller does both on one bracket, with a solar screen in front for daytime and a blackout behind it for sleep. Where you would rather have the look of wood, plantation shutters tilt to send the low afternoon sun up toward the ceiling instead of into your eyes.",
      },
      {
        heading: "Working within your village's guidelines",
        body: "Many Summerlin villages have HOA guidelines covering what is visible from the street. Exterior products like solar screens can be seen from outside, so it is worth checking your village's guidelines before ordering anything exterior. Interior shades and shutters sit inside the glass, behind the window.",
      },
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
    local: [
      {
        heading: "Whole-home packages",
        body: "Much of North Las Vegas is recent subdivision construction, with consistent window sizes from room to room. When the openings match, covering the whole house at once is genuinely more efficient than doing it a room at a time, and the price per window comes down. Faux wood blinds are a practical whole-home choice here: they will not warp, fade or crack in direct desert sun, and they wipe clean.",
      },
      {
        heading: "Afternoon heat without the tree cover",
        body: "Many North Las Vegas neighborhoods are new enough to have little mature tree cover, so afternoon heat gain runs higher than homeowners expect. On the west side of the house, exterior solar screens stop the sun before it reaches the glass. Inside, a cellular shade's trapped air slows the heat coming through, and a solar shade cuts the glare while keeping your view.",
      },
      {
        heading: "Homes with kids and pets",
        body: "Cords are the thing to design out in a busy family home. Roller shades come cordless or motorized, cordless lift is available on wood and faux wood blinds and on roman shades, and shutters have no cords at all. Tell us who lives in the house when we come out, and we will steer every window toward a safe option.",
      },
    ],
    seo: {
      title: "North Las Vegas Window Treatments | Premier Shade Solutions",
      description:
        "Custom blinds, shades, and shutters in North Las Vegas, NV, with whole-home packages for consistent subdivision windows. Free in-home consultation.",
    },
  },
];
