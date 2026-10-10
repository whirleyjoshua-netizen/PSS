import { PainsSection, QuestionsSection } from "@/components/consultation/LandingSections";
import { spotlightReviewsExceptFeatured } from "@/components/booking/FeaturedReview";
import { ReviewSpotlight } from "@/components/reviews/ReviewSpotlight";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";
import { business } from "@/content/business";
import { FAQ, STEPS } from "@/content/consultation";
import { holidayPhoto } from "@/content/gallery";
import { HOLIDAY_ICONS, holidayFaq } from "@/content/holiday";
import { Bow, Garland, Ornament, Snowfall, Sparkles, StringLights } from "./Decor";
import { holidayFonts } from "./fonts";
import { HolidayHero } from "./HolidayHero";

const ICONS = {
  home: <path d="M3 11.5 12 4l9 7.5M5.5 9.5V20h13V9.5" />,
  sparkle: <path d="M12 3c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7Z" />,
  heart: <path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z" />,
};
const ORNAMENT_COLORS = ["#B3262F", "#1F4D2E", "#B8913A"];

/** What scrolls along the red ribbon under the hero. The offer's words never appear after Nov 15. */
const RIBBON = {
  offer: ["10% off 3+ custom shades or blinds", "Book your consult by Nov 15", "Motorized shades count", "Free in-home consultation", "Free temporary shades while you wait"],
  family: ["Free in-home consultation", "Ready before the family arrives", "Free temporary shades while you wait", "Every window measured and guaranteed"],
};

/** The holiday ad landing page (spec 2026-10-10; owner: "go all out" with type, decor and motion). */
export function HolidayLanding({ stage }: { stage: "offer" | "family" }) {
  const ribbon = RIBBON[stage];
  return (
    <div className={`holiday-page ${holidayFonts}`}>
      <HolidayHero stage={stage} photo={holidayPhoto} />

      {/* A red satin ribbon with the offer running along it; the list is doubled so the loop is seamless. */}
      <div aria-hidden="true" className="relative overflow-hidden border-y-4 border-champagne bg-holiday-red py-3 text-holiday-snow shadow-[inset_0_2px_0_#f3dc94,inset_0_-2px_0_#f3dc94]">
        <div className="holiday-marquee flex w-max gap-10 whitespace-nowrap">
          {[...ribbon, ...ribbon, ...ribbon, ...ribbon].map((item, index) => (
            <span key={index} className="flex items-center gap-10 font-display text-sm font-medium uppercase tracking-[0.22em]">
              {item}
              <span className="text-champagne">✦</span>
            </span>
          ))}
        </div>
      </div>

      {/* The flyer's three promises, as ornaments hanging from a garland. */}
      <section className="relative overflow-hidden bg-holiday-snow pb-14">
        <Garland scallops={6} />
        <Container>
          <ul className="-mt-6 grid grid-cols-3 gap-2 text-center sm:-mt-10">
            {HOLIDAY_ICONS.map(({ label, icon }, index) => (
              <li key={label} className="flex flex-col items-center gap-4">
                <Ornament color={ORNAMENT_COLORS[index]!} delay={index * -1.1}>
                  {ICONS[icon]}
                </Ornament>
                <span className="holiday-display text-base font-bold italic text-charcoal sm:text-2xl">{label}</span>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <PainsSection />

      {/* How it works, as four presents under the tree. */}
      <section className="relative isolate overflow-hidden bg-holiday-green py-24 text-holiday-snow md:py-32">
        <StringLights scallops={6} perScallop={5} />
        <Snowfall count={30} seed={19} />
        <Sparkles count={10} seed={11} />
        <Container className="relative">
          <p className="holiday-script text-center text-4xl text-champagne md:text-5xl">From your first call</p>
          <h2 className="holiday-display mt-1 text-center text-4xl font-black italic md:text-6xl">to the final install</h2>
          <ol className="mt-16 grid gap-12 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
            {STEPS.map((step, index) => (
              <li key={step.title}>
                <Reveal delayMs={index * 120} className="h-full">
                  <div className="holiday-gift relative h-full bg-holiday-snow text-charcoal shadow-xl">
                    <Bow className="absolute -top-8 left-1/2 w-24 -translate-x-1/2" />
                    <div className="relative h-14 border-b-4 border-holiday-red bg-[repeating-linear-gradient(45deg,#1F4D2E_0_12px,#24583a_12px_24px)]">
                      <div aria-hidden="true" className="absolute inset-y-0 left-1/2 w-5 -translate-x-1/2 bg-holiday-red" />
                      <span className="holiday-display absolute left-4 top-2 text-3xl font-black italic text-[#f3dc94]">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                    </div>
                    <div className="relative flex flex-col gap-2 p-6">
                      <h3 className="holiday-display text-2xl font-bold">{step.title}</h3>
                      <p className="leading-relaxed text-ink-soft">{step.body}</p>
                    </div>
                  </div>
                </Reveal>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      <ReviewSpotlight reviews={spotlightReviewsExceptFeatured} />

      <Garland scallops={7} className="bg-ivory" />
      <QuestionsSection faq={[...holidayFaq(stage), ...FAQ]} />

      {/* The close: red velvet, lights and snow. */}
      <section className="relative isolate overflow-hidden bg-[radial-gradient(ellipse_at_50%_0%,#b3262f,#8E1B25_45%,#5c0f17)] py-28 text-center text-holiday-snow md:py-36">
        <StringLights scallops={5} />
        <Snowfall count={36} seed={29} />
        <Sparkles count={12} seed={5} />
        <Container className="relative">
          <p className="holiday-script text-5xl text-[#f3dc94] md:text-6xl">Ready for the</p>
          <h2 className="holiday-display holiday-gold mx-auto -mt-1 pb-2 text-7xl font-black italic md:text-9xl">Holidays?</h2>
          <p className="mx-auto mt-6 max-w-xl text-lg text-holiday-snow/85">
            Samples in your own light, every window measured by the owner, and a written quote with your lead time on it.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <a
              href="#book"
              className="inline-flex min-h-12 items-center bg-gradient-to-br from-[#f3dc94] via-champagne to-[#b8913a] px-8 py-3 font-display text-sm font-medium uppercase tracking-[0.18em] text-charcoal shadow-lg transition-transform hover:-translate-y-0.5"
            >
              Invite us over
            </a>
            <a
              href={business.phone.href}
              className="inline-flex min-h-12 items-center border border-holiday-snow/50 px-8 py-3 font-display text-sm uppercase tracking-[0.18em] transition-colors hover:bg-holiday-snow hover:text-holiday-red"
            >
              Call {business.phone.display}
            </a>
          </div>
        </Container>
      </section>
    </div>
  );
}
