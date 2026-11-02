import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { __resetHealthStateForTests } from "@/modules/ai/core/policy/health.tracker";
import { __setTestProviderOverride, __clearTestProviderOverrides } from "@/modules/ai/core/providers/provider.registry";
import { AICoreError } from "@/modules/ai/core/types/errors";
import type { AIProvider, ProviderGenerationRequest, ProviderGenerationResponse } from "@/modules/ai/core/types/provider";
import type { AICoreRequest } from "@/modules/ai/core/types/core-request";
import type { WorkspaceUser } from "@/modules/auth/types";

vi.mock("@/lib/middleware/require-business", () => ({ requireBusinessAccess: vi.fn() }));
vi.mock("@/modules/context/service", () => ({ resolveBusinessContext: vi.fn() }));
vi.mock("@/modules/ai/preferences/service", () => ({ resolveEffectiveAIPreferences: vi.fn() }));
vi.mock("@/modules/ai/memory/retrieval.service", () => ({ retrieveBusinessMemories: vi.fn().mockResolvedValue({ items: [] }) })); // 5B.4: DB-backed retrieval boundary (mocked like preferences)
vi.mock("@/modules/ai/core/rate-limit", () => ({ checkAIExecutionRateLimit: vi.fn() }));

import { requireBusinessAccess } from "@/lib/middleware/require-business";
import { resolveBusinessContext } from "@/modules/context/service";
import { resolveEffectiveAIPreferences } from "@/modules/ai/preferences/service";
import { checkAIExecutionRateLimit } from "@/modules/ai/core/rate-limit";
import { resolveExecutionContext } from "@/modules/ai/core/context/execution-context.service";
import { executeAICoreRequest } from "@/modules/ai/core/orchestrator";

const userA = { id: "user_1", workspaceId: "ws_A", workspaceRole: "ADMIN", platformRole: "USER" } as unknown as WorkspaceUser;
const userB = { id: "user_1", workspaceId: "ws_B", workspaceRole: "ADMIN", platformRole: "USER" } as unknown as WorkspaceUser;

class Recorder implements AIProvider {
  readonly id = "openai" as const; readonly displayName = "Recorder"; calls: ProviderGenerationRequest[] = [];
  isConfigured(): boolean { return true; }
  async generate(r: ProviderGenerationRequest): Promise<ProviderGenerationResponse> {
    this.calls.push(r);
    return { content: "ok", finishReason: "STOP", rawFinishReason: "stop", usage: { kind: "PROVIDER_REPORTED", inputTokens: 1, outputTokens: 1, totalTokens: 2 }, latencyMs: 1 };
  }
}
function req(workspaceId: string, o: Partial<AICoreRequest> = {}): AICoreRequest {
  return {
    requestId: "r1", workspaceId, actorUserId: "user_1", requiresBusinessContext: true, businessId: "biz_1",
    messages: [{ role: "USER", content: [{ type: "text", text: "hi" }] }],
    taskRequirements: { requiredCapabilities: ["TEXT_GENERATION"], strategy: "BALANCED", preferredProvider: "openai" }, generationConfig: {}, ...o,
  };
}
const prefs = { language: null, tone: null, detailLevel: "STANDARD" as const, formatting: "NO_PREFERENCE" as const, businessInstructions: null, behaviorConstraints: [] };

let rec: Recorder;
beforeEach(() => {
  __resetHealthStateForTests(); __clearTestProviderOverrides();
  rec = new Recorder(); __setTestProviderOverride("openai", rec);
  vi.mocked(requireBusinessAccess).mockReset().mockResolvedValue({} as never);
  vi.mocked(resolveBusinessContext).mockReset().mockResolvedValue({ business: { preferredLanguage: null }, brand: null } as never);
  vi.mocked(resolveEffectiveAIPreferences).mockReset().mockResolvedValue(prefs);
  vi.mocked(checkAIExecutionRateLimit).mockReset().mockResolvedValue({ allowed: true });
});
afterEach(() => { __clearTestProviderOverrides(); });

function expectNothingTouched() {
  expect(requireBusinessAccess).not.toHaveBeenCalled();
  expect(resolveBusinessContext).not.toHaveBeenCalled();
  expect(resolveEffectiveAIPreferences).not.toHaveBeenCalled();
  expect(rec.calls).toHaveLength(0);
}

describe("resolveExecutionContext: request workspace must equal the authorized workspace", () => {
  it("rejects a mismatch (business-context request) before any business, context or preference access", async () => {
    await expect(resolveExecutionContext(req("ws_B"), userA)).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expectNothingTouched();
  });
  it("rejects a mismatch even when no business context is requested", async () => {
    await expect(resolveExecutionContext(req("ws_B", { requiresBusinessContext: false, businessId: undefined }), userA)).rejects.toBeInstanceOf(AICoreError);
  });
  it("error message does not disclose either workspace ID", async () => {
    try { await resolveExecutionContext(req("ws_B"), userA); expect.fail("should throw"); }
    catch (e) { expect((e as Error).message).not.toMatch(/ws_A|ws_B/); }
  });
  it("accepts a matching workspace and resolves context + preferences", async () => {
    const ctx = await resolveExecutionContext(req("ws_A"), userA);
    expect(ctx.workspaceId).toBe("ws_A");
    expect(ctx.businessPreferences).toEqual(prefs);
    expect(requireBusinessAccess).toHaveBeenCalledWith(userA, "biz_1");
  });
  it("legitimate multi-workspace use: the same user works in workspace B when the request and authorized workspace both say B", async () => {
    const ctx = await resolveExecutionContext(req("ws_B"), userB);
    expect(ctx.workspaceId).toBe("ws_B");
  });
});

describe("executeAICoreRequest: workspace mismatch", () => {
  it("is rejected before the rate limiter, business/preference access and any provider call", async () => {
    await expect(executeAICoreRequest(req("ws_B"), userA)).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(checkAIExecutionRateLimit).not.toHaveBeenCalled();
    expectNothingTouched();
  });
  it("a matching request still executes end to end", async () => {
    const res = await executeAICoreRequest(req("ws_A"), userA);
    expect(res.status).toBe("SUCCESS");
    expect(checkAIExecutionRateLimit).toHaveBeenCalledWith("ws_A");
    expect(rec.calls).toHaveLength(1);
  });
  it("existing business ownership check is still enforced for a matching workspace", async () => {
    vi.mocked(requireBusinessAccess).mockRejectedValue(new Error("not your business"));
    await expect(executeAICoreRequest(req("ws_A"), userA)).rejects.toBeTruthy();
    expect(resolveEffectiveAIPreferences).not.toHaveBeenCalled();
    expect(rec.calls).toHaveLength(0);
  });
});
