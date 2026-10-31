/**
 * Pre-5C closure regression (found by the real-HTTP run): execute with a businessId from ANOTHER workspace was refused
 * (fail-closed, nothing sent to a provider) but reported as 502 "AI generation failed / UNKNOWN_PROVIDER_ERROR", because the
 * orchestrator wrapped the access check's ApiException as an unknown provider error. It must surface as the ApiException.
 * DOUBLES: business access check, context/preferences services, memory retrieval, rate limiter, and the provider.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { __resetHealthStateForTests } from "@/modules/ai/core/policy/health.tracker";
import { __setTestProviderOverride, __clearTestProviderOverrides } from "@/modules/ai/core/providers/provider.registry";
import type { AIProvider, ProviderGenerationRequest, ProviderGenerationResponse } from "@/modules/ai/core/types/provider";
import type { AICoreRequest } from "@/modules/ai/core/types/core-request";
import type { WorkspaceUser } from "@/modules/auth/types";
import { ApiException } from "@/lib/api-response";

vi.mock("@/lib/middleware/require-business", () => ({ requireBusinessAccess: vi.fn() }));
vi.mock("@/modules/context/service", () => ({ resolveBusinessContext: vi.fn() }));
vi.mock("@/modules/ai/preferences/service", () => ({ resolveEffectiveAIPreferences: vi.fn() }));
vi.mock("@/modules/ai/memory/retrieval.service", () => ({ retrieveBusinessMemories: vi.fn().mockResolvedValue({ items: [] }) }));
vi.mock("@/modules/ai/core/rate-limit", () => ({ checkAIExecutionRateLimit: vi.fn() }));
import { requireBusinessAccess } from "@/lib/middleware/require-business";
import { checkAIExecutionRateLimit } from "@/modules/ai/core/rate-limit";
import { executeAICoreRequest } from "@/modules/ai/core/orchestrator";

const user = { id: "user_1", workspaceId: "ws_A", workspaceRole: "ADMIN", platformRole: "USER" } as unknown as WorkspaceUser;
class Recorder implements AIProvider {
  readonly id = "openai" as const; readonly displayName = "Recorder"; calls: ProviderGenerationRequest[] = [];
  isConfigured(): boolean { return true; }
  async generate(r: ProviderGenerationRequest): Promise<ProviderGenerationResponse> { this.calls.push(r); return { content: "ok", finishReason: "STOP", rawFinishReason: "stop", usage: { kind: "PROVIDER_REPORTED", inputTokens: 1, outputTokens: 1, totalTokens: 2 }, latencyMs: 1 }; }
}
const req = (): AICoreRequest => ({ requestId: "r1", workspaceId: "ws_A", actorUserId: "user_1", requiresBusinessContext: true, businessId: "biz_foreign", messages: [{ role: "USER", content: [{ type: "text", text: "hi" }] }], taskRequirements: { requiredCapabilities: ["TEXT_GENERATION"], strategy: "BALANCED", preferredProvider: "openai" }, generationConfig: {} });

let rec: Recorder;
beforeEach(() => {
  __resetHealthStateForTests(); __clearTestProviderOverrides(); rec = new Recorder(); __setTestProviderOverride("openai", rec);
  vi.mocked(checkAIExecutionRateLimit).mockReset().mockResolvedValue({ allowed: true });
  vi.mocked(requireBusinessAccess).mockReset();
});

describe("orchestrator: authorization failures keep their API meaning", () => {
  it("a NOT_FOUND from the business access check is rethrown as the ApiException and no provider is called", async () => {
    vi.mocked(requireBusinessAccess).mockRejectedValue(new ApiException("NOT_FOUND", "Business not found."));
    await expect(executeAICoreRequest(req(), user)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(executeAICoreRequest(req(), user)).rejects.toBeInstanceOf(ApiException);
    expect(rec.calls).toHaveLength(0);
  });
  it("FORBIDDEN is likewise preserved", async () => {
    vi.mocked(requireBusinessAccess).mockRejectedValue(new ApiException("FORBIDDEN", "No access."));
    await expect(executeAICoreRequest(req(), user)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(rec.calls).toHaveLength(0);
  });
  it("an unexpected non-API error is still reported as an unknown orchestrator error (no internals leaked)", async () => {
    vi.mocked(requireBusinessAccess).mockRejectedValue(new Error("db password=hunter2 exploded"));
    const err = await executeAICoreRequest(req(), user).catch((e) => e);
    expect(err.code).toBe("UNKNOWN_PROVIDER_ERROR");
    expect(String(err.message)).not.toContain("hunter2");
    expect(rec.calls).toHaveLength(0);
  });
});
