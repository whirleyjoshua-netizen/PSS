import { SiteChrome } from "@/components/layout/SiteChrome";
import { ButtonLink } from "@/components/ui/Button";

/**
 * Handles every unmatched URL, plus notFound()/dynamicParams misses in
 * (site)/[category], (site)/[category]/[product] and service-area/[city].
 * Renders inside the site chrome so visitors keep the header and footer.
 */
export default function NotFound() {
  return (
    <SiteChrome>
      <div className="mx-auto flex max-w-md flex-col items-start gap-4 px-6 py-24 text-center sm:items-center">
        <h1 className="font-display text-3xl font-light text-charcoal">Page not found</h1>
        <p className="text-ink-soft">
          The page you&rsquo;re looking for doesn&rsquo;t exist or may have moved.
        </p>
        <div className="mt-2 flex flex-wrap gap-4">
          <ButtonLink href="/">Back to home</ButtonLink>
          <ButtonLink href="/contact" variant="outline">Contact us</ButtonLink>
        </div>
      </div>
    </SiteChrome>
  );
}
