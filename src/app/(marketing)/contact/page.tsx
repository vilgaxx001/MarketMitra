import type { Metadata } from "next";
import { ContactForm } from "./_components/contact-form";

export const metadata: Metadata = {
  title: "Contact Us",
  alternates: { canonical: "/contact" },
};

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string }>;
}) {
  const { topic } = await searchParams;

  return (
    <div className="px-6 pb-24 pt-32 md:px-12">
      <div className="mx-auto max-w-xl">
        <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
          Contact us
        </h1>
        <p className="mt-3 text-muted-foreground">
          Questions, billing issues, or interested in the Agency plan — send us a message
          and we&apos;ll get back to you.
        </p>

        <div className="glass mt-8 rounded-xl p-6 md:p-8">
          <ContactForm initialTopic={topic} />
        </div>
      </div>
    </div>
  );
}
