export type Testimonial = {
  quote: string;
  name: string;
  city: string;
};

/**
 * TODO(content): add real reviews as customers leave them.
 *
 * Deliberately empty. Inventing testimonials for a business that has not yet
 * collected them is fabricating evidence, and every consumer of this file
 * renders nothing when it is empty rather than showing placeholders.
 *
 * The fastest honest path to filling this: ask every completed job for a
 * Google review, then quote from those here with the customer's permission.
 */
export const testimonials: Testimonial[] = [];
