import type { Metadata } from "next";
import {
  Instagram,
  Search,
  MessageCircle,
  PenLine,
  CalendarDays,
  TrendingUp,
} from "lucide-react";
import { getCurrentSession } from "@/modules/auth/session";
import { CtaLink } from "@/components/marketing/cta-link";
import { getMarketingCtaHref, getMarketingCtaLabel } from "@/lib/marketing-cta";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Everything MarketMitra generates for your business: Instagram strategy, SEO keywords, ad copy, WhatsApp campaigns, content calendars, and growth roadmaps.",
  alternates: { canonical: "/features" },
};

const DETAILED_FEATURES = [
  {
    icon: Instagram,
    title: "Instagram & Social Strategy",
    body: "MarketMitra generates a content plan built around your industry, audience, and brand voice — captions, hashtag sets, and a posting cadence you can actually keep up with.",
    points: ["Caption writing in your brand tone", "Hashtag research per post", "Reels & carousel ideas"],
  },
  {
    icon: Search,
    title: "SEO Keyword Research",
    body: "Find the search terms your customers are actually using, ranked by how realistic they are to compete for at your business's size and stage.",
    points: ["Local + national keyword sets", "Difficulty-aware prioritization", "Content topic suggestions"],
  },
  {
    icon: PenLine,
    title: "Ad Copy Generation",
    body: "Ready-to-test ad copy for the platforms small businesses actually advertise on.",
    points: ["Google Search ad variants", "Facebook & Instagram ad copy", "Multiple angles per campaign"],
  },
  {
    icon: MessageCircle,
    title: "WhatsApp Campaigns",
    body: "Broadcast-ready campaign messages for the channel most Indian small businesses already use to talk to customers directly.",
    points: ["Promotional broadcast copy", "Festival & seasonal campaigns", "Customer re-engagement messages"],
  },
  {
    icon: CalendarDays,
    title: "Content Calendar",
    body: "A full month of planned content at a glance, so posting stays consistent instead of happening in bursts and going quiet.",
    points: ["Monthly view", "Platform-by-platform breakdown", "Editable before you post"],
  },
  {
    icon: TrendingUp,
    title: "Growth Roadmap",
    body: "A prioritized, step-by-step plan for what to focus on next — not a wall of generic advice.",
    points: ["Prioritized by effort vs. impact", "Updated as your business grows", "Written in plain language"],
  },
];

export default async function FeaturesPage() {
  const session = await getCurrentSession();
  const isLoggedIn = Boolean(session);
  const ctaHref = getMarketingCtaHref(isLoggedIn);
  const ctaLabel = getMarketingCtaLabel(isLoggedIn);

  return (
    <div className="px-6 pb-24 pt-32 md:px-12">
      <div className="mx-auto max-w-content">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground md:text-5xl">
            Everything a marketing hire would do
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            One AI assistant, every channel your business actually uses.
          </p>
        </div>

        <div className="mt-16 grid gap-8 md:grid-cols-2">
          {DETAILED_FEATURES.map((feature) => (
            <div key={feature.title} className="glass rounded-xl p-8">
              <div className="flex size-11 items-center justify-center rounded-lg bg-gradient-to-br from-secondary/20 to-primary/20">
                <feature.icon className="size-5 text-secondary" aria-hidden="true" />
              </div>
              <h2 className="mt-4 text-xl font-semibold text-foreground">{feature.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{feature.body}</p>
              <ul className="mt-4 space-y-2">
                {feature.points.map((point) => (
                  <li key={point} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="size-1 rounded-full bg-secondary" />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-16 flex justify-center">
          <CtaLink
            href={ctaHref}
            cta={ctaLabel}
            location="hero"
            destination={isLoggedIn ? "dashboard" : "signup"}
            size="lg"
          >
            {ctaLabel} {!isLoggedIn && "→"}
          </CtaLink>
        </div>
      </div>
    </div>
  );
}
