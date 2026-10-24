/**
 * src/modules/ai/demo-contract.ts
 *
 * PRODUCTION-READY API CONTRACT — integration point for the future
 * AI Provider Layer (see docs/ARCHITECTURE.md section 5: every provider
 * implements a common `AIProvider` interface, resolved by
 * `provider.factory.ts`, which does not exist yet in this codebase).
 *
 * This file defines the request/response shape the public marketing demo
 * (`POST /api/v1/ai/demo-generate`) will use once that layer is built.
 * Both the API route and the client-side demo form import from here, so
 * there is exactly one definition of the contract — the client never
 * duplicates AI logic, and the eventual real implementation only has to
 * satisfy this shape to slot in without a frontend rewrite.
 *
 * CURRENT STATE: the route this contract describes returns a
 * `FEATURE_NOT_AVAILABLE` error today (see
 * src/app/api/v1/ai/demo-generate/route.ts) because there is no AI
 * provider wired up. Nothing in this codebase calls a real AI model on
 * behalf of an unauthenticated public visitor, and nothing should until
 * the AI Provider Layer + rate limiting + abuse prevention (see
 * src/lib/env.ts's AI_PROVIDER config and the rate-limit dependencies
 * already in package.json — `@upstash/ratelimit`, `ioredis`) are in
 * place server-side.
 */

export const DEMO_OUTPUT_TYPES = [
  "Instagram Strategy",
  "Content Calendar",
  "SEO Keywords",
  "Ad Copy",
  "WhatsApp Campaign",
  "Growth Roadmap",
] as const;

export type DemoOutputType = (typeof DEMO_OUTPUT_TYPES)[number];

export const DEMO_TONES = [
  "Professional",
  "Friendly",
  "Bold & Edgy",
  "Luxury",
  "Desi & Relatable",
] as const;

export type DemoTone = (typeof DEMO_TONES)[number];

export const DEMO_INDUSTRIES = [
  "Food & Restaurant",
  "Retail & Fashion",
  "Healthcare & Wellness",
  "Education & Coaching",
  "Real Estate",
  "E-Commerce",
  "Beauty & Salon",
  "Fitness & Gym",
  "Technology & SaaS",
] as const;

export type DemoIndustry = (typeof DEMO_INDUSTRIES)[number];

/** Request body for POST /api/v1/ai/demo-generate. */
export interface DemoGenerateRequest {
  businessDescription: string;
  industry: DemoIndustry;
  tone: DemoTone;
  outputs: DemoOutputType[];
}

/** One generated section of the strategy output (e.g. "Instagram Strategy"). */
export interface DemoGenerateSection {
  outputType: DemoOutputType;
  title: string;
  /** Sanitized HTML fragment — <strong>, <ul>/<li>, <br> only. Rendered with dangerouslySetInnerHTML
   *  ONLY after server-side sanitization in the real implementation; the current stub never returns
   *  this field. */
  contentHtml: string;
}

export interface DemoGenerateResponse {
  sections: DemoGenerateSection[];
  /** Which provider actually served the request (for transparency, not shown as marketing copy). */
  providerUsed: "openai" | "anthropic" | "gemini" | "grok" | "deepseek";
}

/** Client-side validation limits — the real route re-validates these server-side; never trust the client. */
export const DEMO_LIMITS = {
  businessDescriptionMinLength: 10,
  businessDescriptionMaxLength: 500,
  minOutputs: 1,
  maxOutputs: DEMO_OUTPUT_TYPES.length,
} as const;
