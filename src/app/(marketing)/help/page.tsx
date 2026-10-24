import type { Metadata } from "next";
import Link from "next/link";
import { Rocket, CreditCard, UserCog, Sparkles, MessageCircleQuestion } from "lucide-react";

export const metadata: Metadata = {
  title: "Help Centre",
  alternates: { canonical: "/help" },
};

const CATEGORIES = [
  {
    icon: Rocket,
    title: "Getting started",
    body: "Setting up your workspace and generating your first piece of content.",
  },
  {
    icon: Sparkles,
    title: "AI generation",
    body: "How MarketMitra generates content, and how to get better results.",
  },
  {
    icon: CreditCard,
    title: "Billing & plans",
    body: "Upgrading, downgrading, invoices, and payment methods.",
  },
  {
    icon: UserCog,
    title: "Account & team",
    body: "Managing your account, team members, and permissions.",
  },
];

export default function HelpCentrePage() {
  return (
    <div className="px-6 pb-24 pt-32 md:px-12">
      <div className="mx-auto max-w-content">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground md:text-5xl">
            Help centre
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Our full help article library is being built out. In the meantime, the
            fastest way to get an answer is to reach out directly.
          </p>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-2">
          {CATEGORIES.map((cat) => (
            <div key={cat.title} className="glass rounded-xl p-6">
              <div className="flex size-10 items-center justify-center rounded-lg bg-gradient-to-br from-secondary/20 to-primary/20">
                <cat.icon className="size-5 text-secondary" aria-hidden="true" />
              </div>
              <h2 className="mt-4 text-base font-semibold text-foreground">{cat.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{cat.body}</p>
            </div>
          ))}
        </div>

        <div className="glass mx-auto mt-12 flex max-w-xl flex-col items-center gap-4 rounded-xl p-8 text-center">
          <MessageCircleQuestion className="size-8 text-secondary" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-foreground">Can&apos;t find what you need?</h2>
          <p className="text-sm text-muted-foreground">
            Our FAQ covers the most common questions, or you can message us directly.
          </p>
          <div className="flex gap-3">
            <Link href="/#faq" className="text-sm text-secondary hover:underline">
              View FAQ
            </Link>
            <Link href="/contact" className="text-sm text-secondary hover:underline">
              Contact us
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
