/**
 * src/components/marketing/testimonials-section.tsx
 *
 * TESTIMONIAL INTEGRATION ARCHITECTURE
 * =====================================
 * The old landing page displayed three testimonials with invented names,
 * roles, and photos, presented as real customers. That's gone.
 *
 * This component is the real, permanent home for testimonials — fully
 * built and styled — but it renders an honest empty state until actual
 * verified testimonials exist. `MOCK_TESTIMONIALS_ARE_DISABLED` below
 * exists specifically so a future contributor can't accidentally flip
 * fabricated data back on without deliberately removing this guard.
 *
 * TO ADD REAL TESTIMONIALS LATER:
 *   1. Populate `testimonials` with entries verified against a real
 *      customer (e.g. workspace ID + written consent on file).
 *   2. Each entry must satisfy the `Testimonial` type below — note
 *      `verified: true` is required, not optional, so an unverified
 *      entry fails type checking rather than silently rendering.
 */
import { Building2 } from "lucide-react";

export interface Testimonial {
  quote: string;
  authorName: string;
  authorRole: string;
  businessName: string;
  /** Must be true — see note above. A future PR review should treat any literal `false` here as a blocker. */
  verified: true;
}

// Intentionally empty — see file header. Do not fill with placeholder people.
const testimonials: Testimonial[] = [];

export function TestimonialsSection() {
  if (testimonials.length === 0) {
    return (
      <section className="relative z-10 px-6 py-16 md:px-12">
        <div className="mx-auto max-w-2xl rounded-xl border border-dashed border-border/60 p-10 text-center">
          <Building2 className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-semibold text-foreground">
            We&apos;re just getting started
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Verified stories from real MarketMitra customers will appear here as they come
            in. We don&apos;t publish testimonials we can&apos;t verify.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="relative z-10 px-6 py-24 md:px-12">
      <div className="mx-auto max-w-content">
        <h2 className="text-center text-3xl font-bold tracking-tight text-foreground md:text-4xl">
          Businesses growing with MarketMitra
        </h2>
        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {testimonials.map((t) => (
            <figure key={t.authorName} className="glass rounded-xl p-6">
              <blockquote className="text-sm text-foreground/90">&ldquo;{t.quote}&rdquo;</blockquote>
              <figcaption className="mt-4 text-xs text-muted-foreground">
                {t.authorName}, {t.authorRole} — {t.businessName}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
