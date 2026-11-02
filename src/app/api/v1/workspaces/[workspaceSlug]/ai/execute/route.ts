import { z } from "zod";
import { nanoid } from "nanoid";
import { withApiHandler, apiSuccess, apiValidationError, apiError, ApiException } from "@/lib/api-response";
import { readBoundedJson } from "@/lib/bounded-json";
import { requireWorkspaceAccess } from "@/lib/middleware/require-auth";
import { requirePermission } from "@/modules/rbac";
import { executeAICoreRequest } from "@/modules/ai/core/orchestrator";
import { AI_PROVIDER_IDS } from "@/modules/ai/core/types/provider";
import { AICoreError } from "@/modules/ai/core/types/errors";
import type { NormalizedMessage } from "@/modules/ai/core/types/message";

const messageSchema = z.object({ role: z.enum(["SYSTEM", "USER", "ASSISTANT"]), text: z.string().trim().min(1).max(8_000) });
const executeRequestSchema = z.object({
  messages: z.array(messageSchema).min(1).max(20),
  requiresBusinessContext: z.boolean().default(false),
  businessId: z.string().cuid().optional(),
  strategy: z.enum(["QUALITY", "BALANCED", "FAST", "COST_EFFICIENT"]).default("BALANCED"),
  preferredProvider: z.enum(AI_PROVIDER_IDS).optional(),
  preferredModelId: z.string().max(120).optional(),
  maxOutputTokens: z.number().int().min(1).max(4_096).optional(),
  temperature: z.number().min(0).max(2).optional(),
});

// 20 messages x 8,000 UTF-16 units: even if every unit were a JSON-escaped control character (6 bytes) that is under 1 MiB. Counted in bytes while reading.
const MAX_EXECUTE_BODY_BYTES = 1_048_576;

function toApiError(err: AICoreError) {
  switch (err.code) {
    case "INVALID_REQUEST": return apiError("VALIDATION_ERROR", "The request was invalid.", { code: err.code });
    case "SAFETY_REFUSAL": return apiError("VALIDATION_ERROR", "This request was declined on safety grounds.", { code: err.code });
    case "RATE_LIMIT_EXCEEDED_INTERNAL": return apiError("RATE_LIMITED", "Too many AI requests for this workspace. Please try again shortly.", { code: err.code }, { headers: { "Retry-After": String(Math.max(1, err.details.retryAfterSeconds ?? 1)) } });
    case "RATE_LIMITER_UNAVAILABLE": return apiError("SERVICE_UNAVAILABLE", "AI generation is temporarily paused. Please try again shortly.", { code: err.code }, { headers: { "Retry-After": String(Math.max(1, err.details.retryAfterSeconds ?? 5)) } });
    case "NO_COMPATIBLE_MODEL": case "ALL_CANDIDATES_EXHAUSTED": case "PROVIDER_UNAVAILABLE": case "MODEL_UNAVAILABLE":
      return apiError("PROVIDER_ERROR", "AI generation is temporarily unavailable. Please try again shortly.", { code: err.code });
    case "CONTEXT_LIMIT_EXCEEDED": return apiError("VALIDATION_ERROR", "The request is too long for the available models.", { code: err.code });
    default: return apiError("PROVIDER_ERROR", "AI generation failed. Please try again.", { code: err.code });
  }
}

export const POST = withApiHandler<{ workspaceSlug: string }>(async (req, { params }) => {
  const { workspaceSlug } = await params;
  const workspaceUser = await requireWorkspaceAccess(workspaceSlug);
  await requirePermission(workspaceUser, "ai:execute");
  const body = await readBoundedJson(req, MAX_EXECUTE_BODY_BYTES);
  if (!body.ok) return body.response;
  const result = executeRequestSchema.safeParse(body.data);
  if (!result.success) return apiValidationError(result.error);
  const input = result.data;
  if (input.requiresBusinessContext && !input.businessId) {
    return apiValidationError(new z.ZodError([{ code: "custom", path: ["businessId"], message: "businessId is required when requiresBusinessContext is true" }]));
  }
  const messages: NormalizedMessage[] = input.messages.map((m) => ({ role: m.role, content: [{ type: "text", text: m.text }] }));
  try {
    const response = await executeAICoreRequest(
      {
        requestId: nanoid(24), workspaceId: workspaceUser.workspaceId, actorUserId: workspaceUser.id,
        requiresBusinessContext: input.requiresBusinessContext, businessId: input.businessId, messages,
        taskRequirements: { requiredCapabilities: ["TEXT_GENERATION"], strategy: input.strategy, preferredProvider: input.preferredProvider, preferredModelId: input.preferredModelId },
        generationConfig: { maxOutputTokens: input.maxOutputTokens, temperature: input.temperature },
      },
      workspaceUser
    );
    return apiSuccess({ traceId: response.traceId, content: response.content, provider: response.provider, modelId: response.modelId, finishReason: response.finishReason, usage: response.usage, retryCount: response.retryCount, fallbackCount: response.fallbackCount, totalLatencyMs: response.totalLatencyMs });
  } catch (err) {
    if (err instanceof AICoreError) return toApiError(err);
    if (err instanceof ApiException) throw err;
    throw err;
  }
});
