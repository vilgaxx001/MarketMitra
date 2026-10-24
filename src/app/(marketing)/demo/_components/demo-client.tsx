/**
 * src/app/(marketing)/demo/_components/demo-client.tsx
 *
 * The interactive part of the live AI demo. This form is fully real —
 * every field, every validation rule, and the POST to
 * /api/v1/ai/demo-generate genuinely happens. What's honest rather than
 * real is the *result*: since there's no AI Provider Layer yet (see
 * src/modules/ai/demo-contract.ts), the API returns a typed
 * FEATURE_NOT_AVAILABLE response, and this component renders that as a
 * clearly labeled preview state — never as a fabricated "AI-generated"
 * result attributed to the visitor's own input.
 */
"use client";

import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics/track";
import {
  DEMO_INDUSTRIES,
  DEMO_TONES,
  DEMO_OUTPUT_TYPES,
  DEMO_LIMITS,
  type DemoIndustry,
  type DemoTone,
  type DemoOutputType,
} from "@/modules/ai/demo-contract";
import type { ApiError } from "@/lib/api-response";

type SubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "preview"; message: string }
  | { status: "error"; message: string };

const ILLUSTRATIVE_EXAMPLE = {
  outputType: "Instagram Strategy" as DemoOutputType,
  bullets: [
    "3 posts/week: 1 product spotlight, 1 behind-the-scenes, 1 customer story",
    "Hashtag mix of 5 broad + 10 niche + 5 local tags per post",
    "Weekly Reel using a trending audio, tied back to your core offer",
  ],
};

export function DemoClient() {
  const [businessDescription, setBusinessDescription] = useState("");
  const [industry, setIndustry] = useState<DemoIndustry | "">("");
  const [tone, setTone] = useState<DemoTone | "">("");
  const [outputs, setOutputs] = useState<DemoOutputType[]>(["Instagram Strategy"]);
  const [state, setState] = useState<SubmitState>({ status: "idle" });

  const descriptionValid =
    businessDescription.trim().length >= DEMO_LIMITS.businessDescriptionMinLength &&
    businessDescription.trim().length <= DEMO_LIMITS.businessDescriptionMaxLength;
  const canSubmit = descriptionValid && industry !== "" && tone !== "" && outputs.length > 0;

  function toggleOutput(output: DemoOutputType) {
    track("demo_interaction", { action: "output_toggle", field: output });
    setOutputs((prev) =>
      prev.includes(output) ? prev.filter((o) => o !== output) : [...prev, output]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    track("demo_interaction", { action: "submit" });
    setState({ status: "submitting" });

    try {
      const res = await fetch("/api/v1/ai/demo-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessDescription, industry, tone, outputs }),
      });
      const body = await res.json();

      if (!res.ok) {
        const errorBody = body as ApiError;
        if (errorBody.error?.code === "FEATURE_NOT_AVAILABLE") {
          setState({ status: "preview", message: errorBody.error.message });
        } else {
          setState({ status: "error", message: errorBody.error?.message ?? "Something went wrong." });
        }
        return;
      }

      // A real AI Provider Layer isn't built yet, so this branch is
      // unreachable today — kept so the success path is exercised the
      // moment the backend starts returning real data.
      setState({ status: "preview", message: "Generated." });
    } catch {
      setState({ status: "error", message: "Couldn't reach the server. Please try again." });
    }
  }

  return (
    <div className="glass mx-auto max-w-3xl rounded-2xl p-6 md:p-10">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <Label htmlFor="business-description">Describe your business</Label>
          <Textarea
            id="business-description"
            value={businessDescription}
            onChange={(e) => setBusinessDescription(e.target.value)}
            onFocus={() => track("demo_interaction", { action: "field_focus", field: "businessDescription" })}
            placeholder="e.g. A home bakery in Pune specializing in eggless cakes, currently getting most orders through Instagram DMs."
            maxLength={DEMO_LIMITS.businessDescriptionMaxLength}
            rows={4}
            aria-describedby="business-description-hint"
          />
          <p id="business-description-hint" className="mt-1 text-xs text-muted-foreground">
            {businessDescription.trim().length}/{DEMO_LIMITS.businessDescriptionMaxLength} characters
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <Label htmlFor="industry">Industry</Label>
            <select
              id="industry"
              value={industry}
              onChange={(e) => setIndustry(e.target.value as DemoIndustry)}
              className="mt-1.5 w-full rounded-md border border-input bg-surface-sunken px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="" disabled>
                Select an industry
              </option>
              {DEMO_INDUSTRIES.map((ind) => (
                <option key={ind} value={ind}>
                  {ind}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="tone">Content tone</Label>
            <select
              id="tone"
              value={tone}
              onChange={(e) => {
                setTone(e.target.value as DemoTone);
                track("demo_interaction", { action: "tone_select", field: e.target.value });
              }}
              className="mt-1.5 w-full rounded-md border border-input bg-surface-sunken px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="" disabled>
                Select a tone
              </option>
              {DEMO_TONES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        <fieldset>
          <legend className="text-sm font-medium text-foreground">
            What do you want generated?
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {DEMO_OUTPUT_TYPES.map((output) => {
              const active = outputs.includes(output);
              return (
                <button
                  type="button"
                  key={output}
                  onClick={() => toggleOutput(output)}
                  aria-pressed={active}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm transition-colors duration-fast",
                    active
                      ? "border-secondary bg-secondary/15 text-secondary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  {output}
                </button>
              );
            })}
          </div>
        </fieldset>

        <Button type="submit" size="lg" disabled={!canSubmit || state.status === "submitting"} className="w-full">
          {state.status === "submitting" ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Generating…
            </>
          ) : (
            <>
              <Sparkles className="size-4" /> Generate
            </>
          )}
        </Button>
      </form>

      {state.status === "preview" && (
        <div className="mt-8 space-y-4">
          <Alert variant="warning">
            <AlertTitle>This is a product preview</AlertTitle>
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>

          <div className="rounded-xl border border-dashed border-border/60 p-6">
            <div className="mb-3 flex items-center gap-2">
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                Illustrative example — not generated from your input
              </span>
            </div>
            <h3 className="text-sm font-semibold text-foreground">{ILLUSTRATIVE_EXAMPLE.outputType}</h3>
            <ul className="mt-3 space-y-2">
              {ILLUSTRATIVE_EXAMPLE.bullets.map((b) => (
                <li key={b} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <span className="mt-1.5 size-1 shrink-0 rounded-full bg-secondary" />
                  {b}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {state.status === "error" && (
        <Alert variant="destructive" className="mt-8">
          <AlertTitle>Couldn&apos;t process that</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
