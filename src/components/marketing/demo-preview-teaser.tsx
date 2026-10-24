/**
 * src/components/marketing/demo-preview-teaser.tsx
 *
 * Homepage teaser for the full interactive demo at /demo. Kept
 * deliberately lightweight (no form, no API call) — the real demo
 * experience lives on its own page so it can be linked to directly.
 */
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { CtaLink } from "@/components/marketing/cta-link";

export function DemoPreviewTeaser() {
  return (
    <section id="demo" className="relative z-10 px-6 py-24 md:px-12">
      <div className="glass mx-auto flex max-w-content flex-col items-center gap-6 rounded-2xl p-10 text-center md:p-16">
        <div className="flex size-12 items-center justify-center rounded-full bg-gradient-to-br from-secondary/20 to-primary/20">
          <Sparkles className="size-6 text-secondary" aria-hidden="true" />
        </div>
        <h2 className="max-w-lg text-3xl font-bold tracking-tight text-foreground md:text-4xl">
          See what MarketMitra would build for your business
        </h2>
        <p className="max-w-xl text-muted-foreground">
          Describe your business, pick a tone, and choose what you want generated. It
          takes under a minute.
        </p>
        <CtaLink href="/demo" cta="Try the live demo" location="demo" destination="signup" size="lg">
          Try the live demo →
        </CtaLink>
        <Link href="/demo" className="text-xs text-muted-foreground hover:text-foreground">
          No signup required to try it
        </Link>
      </div>
    </section>
  );
}
