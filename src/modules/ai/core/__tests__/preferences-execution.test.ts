import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { __resetHealthStateForTests } from "@/modules/ai/core/policy/health.tracker";
import { __setTestProviderOverride, __clearTestProviderOverrides } from "@/modules/ai/core/providers/provider.registry";
import type { AIProvider, ProviderGenerationRequest, ProviderGenerationResponse } from "@/modules/ai/core/types/provider";
import type { AICoreRequest } from "@/modules/ai/core/types/core-request";
import type { WorkspaceUser } from "@/modules/auth/types";

vi.mock("@/lib/middleware/require-business", () => ({ requireBusinessAccess: vi.fn() }));
vi.mock("@/modules/context/service", () => ({ resolveBusinessContext: vi.fn() }));
vi.mock("@/modules/ai/preferences/service", () => ({ resolveEffectiveAIPreferences: vi.fn() }));
vi.mock("@/modules/ai/memory/retrieval.service", () => ({ retrieveBusinessMemories: vi.fn().mockResolvedValue({ items: [] }) })); // 5B.4: DB-backed retrieval boundary (mocked like preferences)
vi.mock("@/modules/ai/core/rate-limit", () => ({ checkAIExecutionRateLimit: vi.fn().mockResolvedValue({ allowed: true, configured: false }) }));

import { requireBusinessAccess } from "@/lib/middleware/require-business";
import { resolveBusinessContext } from "@/modules/context/service";
import { resolveEffectiveAIPreferences } from "@/modules/ai/preferences/service";
import { executeAICoreRequest } from "@/modules/ai/core/orchestrator";

const workspaceUser = { id: "user_1", workspaceId: "ws_1", workspaceRole: "ADMIN", platformRole: "USER" } as unknown as WorkspaceUser;

class Recorder implements AIProvider {
  readonly id = "openai" as const;
  readonly displayName = "Recorder";
  calls: ProviderGenerationRequest[] = [];
  isConfigured(): boolean { return true; }
  async generate(r: ProviderGenerationRequest): Promise<ProviderGenerationResponse> {
    this.calls.push(r);
    return { content: "ok", finishReason: "STOP", rawFinishReason: "stop", usage: { kind: "PROVIDER_REPORTED", inputTokens: 1, outputTokens: 1, totalTokens: 2 }, latencyMs: 1 };
  }
}

function req(o: Partial<AICoreRequest> = {}): AICoreRequest {
  return {
    requestId: "r1", workspaceId: "ws_1", actorUserId: "user_1", requiresBusinessContext: true, businessId: "biz_1",
    messages: [{ role: "SYSTEM", content: [{ type: "text", text: "PLATFORM RULES" }] }, { role: "USER", content: [{ type: "text", text: "write a caption" }] }],
    taskRequirements: { requiredCapabilities: ["TEXT_GENERATION"], strategy: "BALANCED", preferredProvider: "openai" }, generationConfig: {}, ...o,
  };
}
const prefs = { language: { value: "Hindi", source: "business_profile" as const }, tone: null, detailLevel: "CONCISE" as const, formatting: "NO_PREFERENCE" as const, businessInstructions: "Mention free delivery", behaviorConstraints: ["No discounts"] };

let rec: Recorder;
beforeEach(() => {
  __resetHealthStateForTests(); __clearTestProviderOverrides();
  rec = new Recorder(); __setTestProviderOverride("openai", rec);
  vi.mocked(requireBusinessAccess).mockReset().mockResolvedValue({} as never);
  vi.mocked(resolveBusinessContext).mockReset().mockResolvedValue({ business: { preferredLanguage: "Hindi" }, brand: null } as never);
  vi.mocked(resolveEffectiveAIPreferences).mockReset().mockResolvedValue(prefs);
});
afterEach(() => { __clearTestProviderOverrides(); });

describe("Business AI Preferences in the execution pipeline", () => {
  it("resolves preferences after business access + context, for the verified businessId", async () => {
    await executeAICoreRequest(req(), workspaceUser);
    expect(requireBusinessAccess).toHaveBeenCalledWith(workspaceUser, "biz_1");
    expect(resolveEffectiveAIPreferences).toHaveBeenCalledWith(workspaceUser, "biz_1", expect.anything());
  });
  it("the provider receives the preference block AFTER the caller's system text (5B.5: one escaped JSON data line)", async () => {
    await executeAICoreRequest(req(), workspaceUser);
    const sys = rec.calls[0]!.systemInstruction!;
    const OPEN = '<business_preferences trust="untrusted-data" encoding="json">';
    expect(sys.startsWith("PLATFORM RULES")).toBe(true);
    expect(sys.indexOf(OPEN)).toBeGreaterThan(sys.indexOf("PLATFORM RULES"));
    const lines = sys.split("\n");
    const data = JSON.parse(lines[lines.indexOf(OPEN) + 1]!);
    expect(data).toEqual({ language: "Hindi", responseDetail: "Keep responses concise.", businessInstructions: "Mention free delivery", behaviorConstraints: ["No discounts"] });
    expect(lines[lines.indexOf(OPEN) + 2]).toBe("</business_preferences>");
  });
  it("preferences are never added to the user/assistant messages", async () => {
    await executeAICoreRequest(req(), workspaceUser);
    expect(JSON.stringify(rec.calls[0]!.messages)).not.toContain("Hindi");
    expect(rec.calls[0]!.messages).toHaveLength(1);
  });
  it("preferences do not influence routing (same candidates/selection with and without preferences)", async () => {
    const withPrefs = await executeAICoreRequest(req(), workspaceUser);
    vi.mocked(resolveEffectiveAIPreferences).mockResolvedValue({ ...prefs, language: null, detailLevel: "STANDARD", businessInstructions: null, behaviorConstraints: [] });
    const without = await executeAICoreRequest(req(), workspaceUser);
    expect(withPrefs.modelId).toBe(without.modelId);
    expect(withPrefs.routing).toEqual(without.routing);
  });
  it("a business with default preferences and no Module 4 language/tone gets the caller's system text unchanged", async () => {
    vi.mocked(resolveEffectiveAIPreferences).mockResolvedValue({ language: null, tone: null, detailLevel: "STANDARD", formatting: "NO_PREFERENCE", businessInstructions: null, behaviorConstraints: [] });
    await executeAICoreRequest(req(), workspaceUser);
    expect(rec.calls[0]!.systemInstruction).toBe("PLATFORM RULES");
  });
  it("requests without business context never load preferences and are unchanged", async () => {
    await executeAICoreRequest(req({ requiresBusinessContext: false, businessId: undefined }), workspaceUser);
    expect(resolveEffectiveAIPreferences).not.toHaveBeenCalled();
    expect(rec.calls[0]!.systemInstruction).toBe("PLATFORM RULES");
  });
  it("a cross-business access failure stops the request before preferences load or any provider call", async () => {
    vi.mocked(requireBusinessAccess).mockRejectedValue(new Error("not your business"));
    await expect(executeAICoreRequest(req(), workspaceUser)).rejects.toBeTruthy();
    expect(resolveEffectiveAIPreferences).not.toHaveBeenCalled();
    expect(rec.calls).toHaveLength(0);
  });
  it("a preferences failure fails the request closed (no provider call with silently dropped preferences)", async () => {
    vi.mocked(resolveEffectiveAIPreferences).mockRejectedValue(new Error("db down"));
    await expect(executeAICoreRequest(req(), workspaceUser)).rejects.toBeTruthy();
    expect(rec.calls).toHaveLength(0);
  });
});
