import type { Metadata } from "next";
import { DemoClient } from "./_components/demo-client";

export const metadata: Metadata = {
  title: "Live Demo",
  description:
    "See what MarketMitra would generate for your business — Instagram strategy, SEO keywords, ad copy, and more.",
  alternates: { canonical: "/demo" },
};

export default function DemoPage() {
  return (
    <div className="px-6 pb-24 pt-32 md:px-12">
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="text-4xl font-bold tracking-tight text-foreground md:text-5xl">
          Try MarketMitra on your business
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Describe your business, choose a tone, and pick what you&apos;d like generated.
        </p>
      </div>

      <div className="mt-12">
        <DemoClient />
      </div>
    </div>
  );
}
