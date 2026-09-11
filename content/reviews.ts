/**
 * Client surveys from the owners' work BEFORE Premier Shade Solutions.
 *
 * Josh installed and Shade designed for Custom Decorators (since bought by
 * Hunter Douglas), in Ohio and later in Las Vegas. These are reviews of the
 * two of them, not of this company, so every surface that shows them must say
 * where they came from — presenting them as Premier Shade customer reviews
 * would misrepresent whose experience they describe (FTC 16 CFR Part 465).
 * For the same reason they never go into Review or AggregateRating structured
 * data. Reviews of Premier Shade itself belong in content/testimonials.ts.
 *
 * Quotes are verbatim from the survey emails. Names are first name and last
 * initial only; tests/reviews.test.tsx fails on anything longer.
 */

export type PastReview = {
  quote: string;
  /** First name and last initial, e.g. "Martha M." */
  name: string;
  /** Survey month, YYYY-MM. */
  date: string;
  /** Whose work the review is about. */
  about: "Josh" | "Shade";
  /** One of the handful rotated on the About page. */
  spotlight?: true;
};

/**
 * Totals across every survey received, including the ones not quoted below:
 * Josh 24 (twenty 5-star, four 4-star), Shade 20 (all 5-star). Surveys with no
 * written comment, and a few about company policy rather than the owners'
 * work, count here but are not quoted.
 */
export const pastWork = {
  source: "Custom Decorators",
  surveys: 44,
  averageRating: 4.9,
} as const;

export const pastReviews: PastReview[] = [
  { about: "Josh", name: "Martha M.", date: "2024-03", spotlight: true, quote: "Beautiful fabrics. Installation went seamless. Very impressed with the installer, Josh. Now I have a beautiful home and I know my family and friends will be envious." },
  { about: "Josh", name: "Susan B.", date: "2024-04", quote: "Josh was friendly and efficient - he did a beautiful job hanging the shades and the door treatment." },
  { about: "Josh", name: "Ester O.", date: "2024-10", spotlight: true, quote: "Joshua did an excellent job, I am very happy with my window treatments!" },
  { about: "Josh", name: "Bobbie K.", date: "2023-11", spotlight: true, quote: "Josh came when expected. He was very organized and efficient removing the old blinds and installing the new ones. Very pleased with my new blinds!" },
  { about: "Josh", name: "Samuel W.", date: "2024-02", quote: "Josh did a great job! He was very personable and helpful!" },
  { about: "Josh", name: "Tina R.", date: "2023-12", quote: "Josh did a wonderful and professional job." },
  { about: "Josh", name: "Judy L.", date: "2024-03", quote: "He was very professional and completed the job very efficiently." },
  { about: "Josh", name: "Marnita N.", date: "2024-04", quote: "Everything went well. Appreciate the great service." },
  { about: "Josh", name: "Victoria W.", date: "2024-05", quote: "Fast, clean and professional" },
  { about: "Josh", name: "Pat P.", date: "2024-05", quote: "Excellent job done!!!!" },
  { about: "Josh", name: "Beth P.", date: "2024-02", quote: "Enjoyable experience!" },
  { about: "Josh", name: "Kim F.", date: "2024-03", quote: "He did a great job" },
  { about: "Josh", name: "Mary-Jane G.", date: "2024-05", quote: "Great job" },
  { about: "Josh", name: "Nusheen J.", date: "2024-12", quote: "professional" },

  { about: "Shade", name: "Terrence M.", date: "2023-12", spotlight: true, quote: "Shade was an excellent consultant. She knew her items and made good recommendations. Very helpful and friendly." },
  { about: "Shade", name: "Beth P.", date: "2024-01", spotlight: true, quote: "Great consultation~ Shade was very knowledgeable about the shades! She answered all my questions! Was a pleasant experience! Thanks Shade!" },
  { about: "Shade", name: "Daniel L.", date: "2024-02", quote: "The product and installation are excellent. Shade was great to work with. Kudos to all" },
  { about: "Shade", name: "Pam M.", date: "2024-02", quote: "Shade was delightful and patient. She measured and explained everything. I appreciate it" },
  { about: "Shade", name: "Bobbie K.", date: "2023-11", quote: "Shade did an excellent job. She was knowledgeable and did a great job helping me make decisions." },
  { about: "Shade", name: "Phyllis H.", date: "2024-03", quote: "Shade was great, very nice and patient with me. What a great employee you have." },
  { about: "Shade", name: "Kelly M.", date: "2024-01", quote: "Shade is very knowledgeable & helpful. I enjoy working with her" },
  { about: "Shade", name: "Linda W.", date: "2023-10", quote: "Excellent, professional and informative. The associate was on time and answered all my questions." },
  { about: "Shade", name: "Karen S.", date: "2024-02", quote: "She was very pleasant and helpful, did not rush me." },
  { about: "Shade", name: "Marnita N.", date: "2024-03", quote: "Everything went extremely well. Looking for to finalizing everything very soon." },
  { about: "Shade", name: "Randy M.", date: "2023-11", quote: "Very helpful and very professional." },
  { about: "Shade", name: "Sophia M.", date: "2024-04", quote: "Very nice ! Seemed concern with some of my issues." },
  { about: "Shade", name: "Czerny B.", date: "2024-05", quote: "Good very helpful and knowledgeable" },
  { about: "Shade", name: "Amy S.", date: "2023-11", quote: "Very kind and professional" },
  { about: "Shade", name: "Daniel L.", date: "2023-11", quote: "Went very well" },
];
