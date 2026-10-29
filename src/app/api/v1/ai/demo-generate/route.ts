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
 *   - Abuse protection is IN PLACE: a per-client-IP rate limit (src/lib/rate-limit, policy in docs/RATE_LIMITING.md) is
 *     enforced before the body is read, and the body is size-bounded (BODY_LIMITS.publicForm). Both apply today even though
 *     the route calls no provider; a real implementation must keep them, and should add a spend ceiling before calling any
 *     paid provider API on behalf of an anonymous visitor.
 *
 * TO IMPLEMENT FOR REAL (Module 5):
 *   1. Build `src/modules/ai/providers/*` implementing the `AIProvider`
 *      interface and `provider.factory.ts` to resolve one.
 *   2. (Done) Rate limiter keyed by client IP; see above.
 *   3. Replace the `apiError("FEATURE_NOT_AVAILABLE", ...)` below with a
 *      real call through the factory, sanitize the returned HTML server
 *      side, and return `apiSuccess<DemoGenerateResponse>(...)`.
 *   4. Nothing in the client demo form needs to change — it already
 *      handles both the error and success shapes.
 */

import { z } from "zod";
import { withApiHandler, apiError, apiValidationError } from "@/lib/api-response";
import { isDefaultAIProviderConfigured } from "@/lib/env";
import { readBoundedJson, BODY_LIMITS } from "@/lib/bounded-json";
import { enforceIpLimit } from "@/lib/rate-limit";
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
  await enforceIpLimit(req, "demoGenerate");
  const parsedBody = await readBoundedJson(req, BODY_LIMITS.publicForm);
  if (!parsedBody.ok) return parsedBody.response;
  const result = demoGenerateSchema.safeParse(parsedBody.data);
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
