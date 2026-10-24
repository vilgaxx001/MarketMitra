/**
 * src/app/api/v1/ai/demo-generate/route.ts
 *
 * Public, unauthenticated endpoint backing the marketing site's "Live AI
 * Demo" (src/app/(marketing)/demo). See src/modules/ai/demo-contract.ts
 * for the full request/response shape this route implements.
 *
 * CURRENT BEHAVIOUR — INTENTIONAL:
 * This route does NOT call any AI provider. There is no AI Provider
 * Layer in this codebase yet (see docs/ARCHITECTURE.md section 5 —
 * `provider.factory.ts` doesn't exist), and per the project's mandatory
 * rule against simulated functionality, this route must not pretend to
 * generate real output. It performs full, real input validation (so the
 * contract and the client form are genuinely exercised end-to-end) and
 * then returns a typed `FEATURE_NOT_AVAILABLE` response. The marketing
 * demo page renders that response as an honest "product preview" state.
 *
 * WHAT'S ALREADY IN PLACE FOR WHEN THE AI PROVIDER LAYER LANDS:
 *   - `env.AI_PROVIDER` / per-provider API key config (src/lib/env.ts)
 *   - `isDefaultAIProviderConfigured` flag (src/lib/env.ts) — this route
 *     already reports it in the response `details` so the client can
 *     distinguish "not built yet" from "built but misconfigured" once
 *     the service layer exists.
 *   - Rate-limiting dependencies already declared in package.json
 *     (`@upstash/ratelimit`, `ioredis`) for when this route needs to
 *     defend against abuse from an unauthenticated public endpoint —
 *     NOT yet wired here; a real implementation must add rate limiting
 *     before calling any paid provider API on behalf of an anonymous
 *     visitor.
 *
 * TO IMPLEMENT FOR REAL (Module 5):
 *   1. Build `src/modules/ai/providers/*` implementing the `AIProvider`
 *      interface and `provider.factory.ts` to resolve one.
 *   2. Add a rate limiter here keyed by IP (Upstash + the `ioredis`
 *      client already in package.json).
 *   3. Replace the `apiError("FEATURE_NOT_AVAILABLE", ...)` below with a
 *      real call through the factory, sanitize the returned HTML server
 *      side, and return `apiSuccess<DemoGenerateResponse>(...)`.
 *   4. Nothing in the client demo form needs to change — it already
 *      handles both the error and success shapes.
 */

import { z } from "zod";
import { withApiHandler, apiError, apiValidationError } from "@/lib/api-response";
import { isDefaultAIProviderConfigured } from "@/lib/env";
import {
  DEMO_OUTPUT_TYPES,
  DEMO_TONES,
  DEMO_INDUSTRIES,
  DEMO_LIMITS,
} from "@/modules/ai/demo-contract";

const demoGenerateSchema = z.object({
  businessDescription: z
    .string()
    .trim()
    .min(DEMO_LIMITS.businessDescriptionMinLength, "Tell us a little more about your business.")
    .max(DEMO_LIMITS.businessDescriptionMaxLength, "Keep it under 500 characters."),
  industry: z.enum(DEMO_INDUSTRIES),
  tone: z.enum(DEMO_TONES),
  outputs: z
    .array(z.enum(DEMO_OUTPUT_TYPES))
    .min(DEMO_LIMITS.minOutputs, "Select at least one output type.")
    .max(DEMO_LIMITS.maxOutputs),
});

export const POST = withApiHandler(async (req) => {
  const body = await req.json();
  const result = demoGenerateSchema.safeParse(body);
  if (!result.success) return apiValidationError(result.error);

  // Input is fully validated at this point — this is a real, working
  // contract boundary, not a placeholder. What's missing is the provider
  // call itself.
  return apiError(
    "FEATURE_NOT_AVAILABLE",
    "Live AI generation isn't connected yet. This preview shows the exact experience once it is.",
    { aiProviderLayerBuilt: false, defaultProviderConfigured: isDefaultAIProviderConfigured }
  );
});
