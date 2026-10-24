/**
 * src/components/marketing/problem-section.tsx
 *
 * Server Component, fully static. The three points here describe a
 * general, well-known market reality for small businesses (agency
 * retainers, the time cost of DIY marketing, and inconsistent posting)
 * rather than any claim about MarketMitra's own measured results — that
 * distinction is why this content was kept while the fabricated stat
 * counters and mini-charts elsewhere on the old page were removed.
 */
const PAIN_POINTS = [
  {
    title: "Agencies are expensive",
    body: "A dedicated marketing agency in India typically runs ₹15,000–₹50,000+ a month — often out of reach for a small business, especially in the first few years.",
  },
  {
    title: "DIY marketing takes real time",
    body: "Writing captions, planning a content calendar, researching keywords — it adds up to hours every week, on top of actually running the business.",
  },
  {
    title: "Inconsistency kills momentum",
    body: "Posting for two weeks and then going quiet for a month is one of the most common reasons small business marketing doesn't compound over time.",
  },
];

export function ProblemSection() {
  return (
    <section className="relative z-10 px-6 py-24 md:px-12">
      <div className="mx-auto max-w-content">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Marketing shouldn&apos;t be this hard for a small business
          </h2>
          <p className="mt-4 text-muted-foreground">
            Most small business owners know they need consistent marketing. Very few have
            the time, budget, or in-house expertise to actually do it.
          </p>
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {PAIN_POINTS.map((point) => (
            <div key={point.title} className="glass rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground">{point.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{point.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
