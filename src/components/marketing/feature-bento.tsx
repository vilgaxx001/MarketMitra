/**
 * src/components/marketing/feature-bento.tsx
 *
 * Server Component. Each card describes a real product capability
 * (matches the DEMO_OUTPUT_TYPES in src/modules/ai/demo-contract.ts).
 *
 * NOTE ON REMOVED CONTENT: the previous version paired these feature
 * descriptions with mini bar-charts asserting specific numbers — "87
 * SEO score", "78%/61%/44% competitor comparison", "engagement growth
 * after using MarketMitra" — none backed by real, measured data. Those
 * are gone. The decorative visuals below are abstract/illustrative
 * (gradients, icons) and don't assert any outcome.
 */
import {
  Instagram,
  Search,
  MessageCircle,
  PenLine,
  CalendarDays,
  TrendingUp,
} from "lucide-react";

const FEATURES = [
  {
    icon: Instagram,
    title: "Instagram & Social Strategy",
    body: "A ready-to-post content plan tailored to your industry and brand voice — captions, hashtags, and posting cadence included.",
    span: "md:col-span-2",
  },
  {
    icon: Search,
    title: "SEO Keyword Research",
    body: "Find the exact terms your customers are searching for, prioritized by how achievable they are for a business your size.",
    span: "",
  },
  {
    icon: PenLine,
    title: "Ad Copy Generation",
    body: "Google, Facebook & Instagram ad copy variants, written to your brand tone and ready to test.",
    span: "",
  },
  {
    icon: MessageCircle,
    title: "WhatsApp Campaigns",
    body: "Broadcast-ready campaign copy for the channel where most Indian small businesses already talk to customers.",
    span: "md:col-span-2",
  },
  {
    icon: CalendarDays,
    title: "Content Calendar",
    body: "A month at a glance, so posting stays consistent instead of happening in bursts.",
    span: "",
  },
  {
    icon: TrendingUp,
    title: "Growth Roadmap",
    body: "A prioritized, step-by-step plan for what to focus on next as your business grows.",
    span: "",
  },
];

export function FeatureBento() {
  return (
    <section id="features" className="relative z-10 px-6 py-24 md:px-12">
      <div className="mx-auto max-w-content">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Everything a marketing hire would do — in one place
          </h2>
          <p className="mt-4 text-muted-foreground">
            One AI assistant across every channel your business actually uses.
          </p>
        </div>

        <div className="mt-16 grid gap-4 md:grid-cols-3">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className={`glass group relative overflow-hidden rounded-xl p-6 transition-transform duration-base hover:-translate-y-1 ${feature.span}`}
            >
              <div className="flex size-11 items-center justify-center rounded-lg bg-gradient-to-br from-secondary/20 to-primary/20">
                <feature.icon className="size-5 text-secondary" aria-hidden="true" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-foreground">{feature.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{feature.body}</p>
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-8 -right-8 size-32 rounded-full bg-gradient-to-br from-secondary/10 to-accent/10 blur-2xl transition-opacity duration-base group-hover:opacity-80"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
