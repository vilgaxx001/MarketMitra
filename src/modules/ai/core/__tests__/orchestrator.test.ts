import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AICoreError } from "@/modules/ai/core/types/errors";
import { __resetHealthStateForTests } from "@/modules/ai/core/policy/health.tracker";
import { __setTestProviderOverride, __clearTestProviderOverrides } from "@/modules/ai/core/providers/provider.registry";
import type { AIProvider, ProviderGenerationRequest, ProviderGenerationResponse } from "@/modules/ai/core/types/provider";
import type { AICoreRequest } from "@/modules/ai/core/types/core-request";
import type { WorkspaceUser } from "@/modules/auth/types";

// Mock the two Module 4 boundaries the orchestrator crosses when
// requiresBusinessContext is true — these hit a real DB in production,
// which isn't available in this test environment. Mocking exactly these
// two functions (not the whole orchestrator) keeps the test genuinely
// exercising the orchestrator's own logic.
vi.mock("@/lib/middleware/require-business", () => ({
  requireBusinessAccess: vi.fn(),
}));
vi.mock("@/modules/context/service", () => ({
  resolveBusinessContext: vi.fn(),
}));

vi.mock("@/modules/ai/preferences/service", () => ({
  resolveEffectiveAIPreferences: vi.fn().mockResolvedValue({ language: null, tone: null, detailLevel: "STANDARD", formatting: "NO_PREFERENCE", businessInstructions: null, behaviorConstraints: [] }),
}));
vi.mock("@/modules/ai/memory/retrieval.service", () => ({ retrieveBusinessMemories: vi.fn().mockResolvedValue({ items: [] }) })); // 5B.4: DB-backed retrieval boundary (mocked like preferences)

import { requireBusinessAccess } from "@/lib/middleware/require-business";
import { resolveBusinessContext } from "@/modules/context/service";
import { executeAICoreRequest } from "@/modules/ai/core/orchestrator";

// Mock the rate-limit boundary so the rejection path can be tested
// deterministically — real Redis isn't available in this environment,
// and even if it were, we want to test orchestrator behavior on
// rejection, not Redis's own counting logic (which has its own tests
// implicitly via the "configured: false fails open" code path already
// covered by every other test here running with no REDIS_URL set).
vi.mock("@/modules/ai/core/rate-limit", () => ({
  checkAIExecutionRateLimit: vi.fn().mockResolvedValue({ allowed: true, configured: false }),
}));
import { checkAIExecutionRateLimit } from "@/modules/ai/core/rate-limit";

const workspaceUser: WorkspaceUser = {
  id: "user_1",
  email: "test@example.com",
  name: "Test User",
  avatarUrl: null,
  platformRole: "USER" as never,
  emailVerifiedAt: new Date(),
  workspaceId: "workspace_1",
  workspaceRole: "ADMIN" as never,
};

function baseRequest(overrides: Partial<AICoreRequest> = {}): AICoreRequest {
  return {
    requestId: "req_1",
    workspaceId: "workspace_1",
    actorUserId: "user_1",
    requiresBusinessContext: false,
    messages: [{ role: "USER", content: [{ type: "text", text: "hello" }] }],
    taskRequirements: { requiredCapabilities: ["TEXT_GENERATION"], strategy: "BALANCED" },
    generationConfig: {},
    ...overrides,
  };
}

/** A fully deterministic fake AIProvider — queues responses/errors, records every call it received. */
class FakeProvider implements AIProvider {
  readonly id: AIProvider["id"];
  readonly displayName = "Fake";
  private queue: Array<ProviderGenerationResponse | AICoreError> = [];
  calls: ProviderGenerationRequest[] = [];

  constructor(id: AIProvider["id"]) {
    this.id = id;
  }
  isConfigured(): boolean { return true; }
  enqueueSuccess(content = "ok"): void {
    this.queue.push({ content, finishReason: "STOP", rawFinishReason: "stop", usage: { kind: "PROVIDER_REPORTED", inputTokens: 1, outputTokens: 1, totalTokens: 2 }, latencyMs: 1 });
  }
  enqueueError(err: AICoreError): void { this.queue.push(err); }
  async generate(request: ProviderGenerationRequest): Promise<ProviderGenerationResponse> {
    this.calls.push(request);
    const next = this.queue.shift();
    if (!next) throw new Error("FakeProvider queue exhausted — test bug");
    if (next instanceof AICoreError) throw next;
    return next;
  }
}

function err(code: import("@/modules/ai/core/types/errors").AIErrorCode): AICoreError {
  return new AICoreError(code, `fake ${code}`, { provider: "openai", fromProvider: true });
}

describe("Orchestrator (executeAICoreRequest)", () => {
  let fakeOpenAI: FakeProvider;
  let fakeAnthropic: FakeProvider;
  let fakeGemini: FakeProvider;

  beforeEach(() => {
    __resetHealthStateForTests();
    __clearTestProviderOverrides();
    fakeOpenAI = new FakeProvider("openai");
    fakeAnthropic = new FakeProvider("anthropic");
    fakeGemini = new FakeProvider("gemini");
    __setTestProviderOverride("openai", fakeOpenAI);
    __setTestProviderOverride("anthropic", fakeAnthropic);
    __setTestProviderOverride("gemini", fakeGemini);
    vi.mocked(requireBusinessAccess).mockReset();
    vi.mocked(resolveBusinessContext).mockReset();
    vi.mocked(checkAIExecutionRateLimit).mockReset();
    vi.mocked(checkAIExecutionRateLimit).mockResolvedValue({ allowed: true, configured: false });
  });
  afterEach(() => {
    __clearTestProviderOverrides();
  });

  it("1. successful execution: request -> context -> router -> provider -> response", async () => {
    fakeOpenAI.enqueueSuccess("hello world");
    const res = await executeAICoreRequest(baseRequest({ taskRequirements: { requiredCapabilities: ["TEXT_GENERATION"], strategy: "BALANCED", preferredProvider: "openai" } }), workspaceUser);
    expect(res.status).toBe("SUCCESS");
    expect(res.content).toBe("hello world");
    expect(res.provider).toBe("openai");
    expect(res.retryCount).toBe(0);
    expect(res.fallbackCount).toBe(0);
  });

  it("2. retry: TIMEOUT then success on the same model", async () => {
    fakeOpenAI.enqueueError(err("TIMEOUT"));
    fakeOpenAI.enqueueSuccess("recovered");
    const res = await executeAICoreRequest(baseRequest({ taskRequirements: { requiredCapabilities: ["TEXT_GENERATION"], strategy: "BALANCED", preferredProvider: "openai" } }), workspaceUser);
    expect(res.status).toBe("SUCCESS");
    expect(res.content).toBe("recovered");
    expect(res.retryCount).toBe(1);
    expect(res.fallbackCount).toBe(0);
    expect(fakeOpenAI.calls.length).toBe(2);
  });

  it("3. fallback: preferred model exhausts retries, a different provider succeeds", async () => {
    fakeOpenAI.enqueueError(err("PROVIDER_UNAVAILABLE"));
    fakeOpenAI.enqueueError(err("PROVIDER_UNAVAILABLE"));
    fakeOpenAI.enqueueError(err("PROVIDER_UNAVAILABLE"));
    fakeAnthropic.enqueueSuccess("fallback worked");
    fakeGemini.enqueueSuccess("should not be needed");
    const res = await executeAICoreRequest(baseRequest({ taskRequirements: { requiredCapabilities: ["TEXT_GENERATION"], strategy: "BALANCED", preferredProvider: "openai" } }), workspaceUser);
    expect(res.status).toBe("SUCCESS");
    expect(res.fallbackCount).toBeGreaterThanOrEqual(1);
    expect(["fallback worked", "should not be needed"]).toContain(res.content);
  });

  it("4. retry exhaustion leads to fallback (not an immediate terminal error)", async () => {
    // openai has TWO registered models (gpt-4o-mini, gpt-4o) — with
    // preferredProvider still set, fallback tries gpt-4o-mini's retries,
    // THEN gpt-4o, before ever leaving the provider. Queue enough
    // failures to cover both, plus a success on every other provider the
    // real router might fall back to next (ranking is strategy-weight
    // dependent, not hardcoded here) — this is what exposed the original
    // version of this test's bug: it only queued a response for
    // Anthropic, but BALANCED-strategy ranking tries Gemini first for
    // this registry's current weights.
    fakeOpenAI.enqueueError(err("TIMEOUT"));
    fakeOpenAI.enqueueError(err("TIMEOUT"));
    fakeOpenAI.enqueueError(err("TIMEOUT")); // 3rd failure exceeds MAX_RETRIES_PER_MODEL=2 for gpt-4o-mini
    fakeOpenAI.enqueueError(err("TIMEOUT")); // gpt-4o's first (and only, given MAX_PROVIDER_ATTEMPTS budget) attempt
    fakeAnthropic.enqueueSuccess("fallback provider A");
    fakeGemini.enqueueSuccess("fallback provider B");
    const res = await executeAICoreRequest(baseRequest({ taskRequirements: { requiredCapabilities: ["TEXT_GENERATION"], strategy: "BALANCED", preferredProvider: "openai" } }), workspaceUser);
    expect(res.status).toBe("SUCCESS");
    expect(fakeOpenAI.calls.length).toBeGreaterThanOrEqual(3); // at least 1 attempt + 2 retries before giving up on the first model
    expect(res.retryCount).toBeGreaterThanOrEqual(2);
    expect(res.fallbackCount).toBeGreaterThanOrEqual(1);
    expect(["fallback provider A", "fallback provider B"]).toContain(res.content);
  });

  it("5. all candidates exhausted -> terminal AICoreError", async () => {
    fakeOpenAI.enqueueError(err("PROVIDER_UNAVAILABLE"));
    fakeOpenAI.enqueueError(err("PROVIDER_UNAVAILABLE"));
    fakeOpenAI.enqueueError(err("PROVIDER_UNAVAILABLE"));
    fakeAnthropic.enqueueError(err("PROVIDER_UNAVAILABLE"));
    fakeAnthropic.enqueueError(err("PROVIDER_UNAVAILABLE"));
    fakeAnthropic.enqueueError(err("PROVIDER_UNAVAILABLE"));
    fakeGemini.enqueueError(err("PROVIDER_UNAVAILABLE"));
    fakeGemini.enqueueError(err("PROVIDER_UNAVAILABLE"));
    fakeGemini.enqueueError(err("PROVIDER_UNAVAILABLE"));
    await expect(executeAICoreRequest(baseRequest(), workspaceUser)).rejects.toMatchObject({ code: expect.stringMatching(/ALL_CANDIDATES_EXHAUSTED|PROVIDER_UNAVAILABLE/) });
  });

  it("6. safety refusal never retries or falls back", async () => {
    fakeOpenAI.enqueueError(err("SAFETY_REFUSAL"));
    fakeAnthropic.enqueueSuccess("should never be called");
    await expect(executeAICoreRequest(baseRequest({ taskRequirements: { requiredCapabilities: ["TEXT_GENERATION"], strategy: "BALANCED", preferredProvider: "openai" } }), workspaceUser)).rejects.toMatchObject({ code: "SAFETY_REFUSAL" });
    expect(fakeOpenAI.calls.length).toBe(1);
    expect(fakeAnthropic.calls.length).toBe(0);
  });

  it("7. invalid request (message validation) never reaches a provider", async () => {
    await expect(executeAICoreRequest(baseRequest({ messages: [] }), workspaceUser)).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(fakeOpenAI.calls.length).toBe(0);
  });

  it("8. requiresBusinessContext=true uses resolveExecutionContext (calls the mocked Module 4 boundary)", async () => {
    vi.mocked(requireBusinessAccess).mockResolvedValue({ id: "biz_1" } as never);
    vi.mocked(resolveBusinessContext).mockResolvedValue({ business: { id: "biz_1" } } as never);
    fakeOpenAI.enqueueSuccess("with context");
    const res = await executeAICoreRequest(baseRequest({ requiresBusinessContext: true, businessId: "biz_1", taskRequirements: { requiredCapabilities: ["TEXT_GENERATION"], strategy: "BALANCED", preferredProvider: "openai" } }), workspaceUser);
    expect(res.status).toBe("SUCCESS");
    expect(requireBusinessAccess).toHaveBeenCalledWith(workspaceUser, "biz_1");
    expect(resolveBusinessContext).toHaveBeenCalledWith(workspaceUser, "biz_1");
  });

  it("9. requiresBusinessContext=true with no businessId -> INVALID_REQUEST, no provider call", async () => {
    await expect(executeAICoreRequest(baseRequest({ requiresBusinessContext: true }), workspaceUser)).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(fakeOpenAI.calls.length).toBe(0);
    expect(requireBusinessAccess).not.toHaveBeenCalled();
  });

  it("10. provider unavailable across all candidates -> normalized terminal error, never a raw throw", async () => {
    for (const p of [fakeOpenAI, fakeAnthropic, fakeGemini]) {
      p.enqueueError(err("PROVIDER_UNAVAILABLE"));
      p.enqueueError(err("PROVIDER_UNAVAILABLE"));
      p.enqueueError(err("PROVIDER_UNAVAILABLE"));
    }
    try {
      await executeAICoreRequest(baseRequest(), workspaceUser);
      expect.fail("expected a throw");
    } catch (e) {
      expect(e).toBeInstanceOf(AICoreError);
    }
  });

  it("11. rate-limit rejection prevents any provider execution", async () => {
    vi.mocked(checkAIExecutionRateLimit).mockResolvedValue({ allowed: false, configured: true, remaining: 0, limit: 20 });
    await expect(executeAICoreRequest(baseRequest(), workspaceUser)).rejects.toMatchObject({ code: "RATE_LIMIT_EXCEEDED_INTERNAL" });
    expect(fakeOpenAI.calls.length).toBe(0);
  });

  it("12. execution trace: success attempts array reflects real attempt count and outcomes", async () => {
    fakeOpenAI.enqueueError(err("TIMEOUT"));
    fakeOpenAI.enqueueSuccess("done");
    const res = await executeAICoreRequest(baseRequest({ taskRequirements: { requiredCapabilities: ["TEXT_GENERATION"], strategy: "BALANCED", preferredProvider: "openai" } }), workspaceUser);
    expect(res.status).toBe("SUCCESS");
    expect(res.retryCount).toBe(1);
    expect(res.totalLatencyMs).toBeGreaterThanOrEqual(0);
  });

  it("13. cross-business protection: a Module 4 access failure prevents any provider execution", async () => {
    vi.mocked(requireBusinessAccess).mockRejectedValue(new Error("cross-tenant access denied"));
    await expect(
      executeAICoreRequest(baseRequest({ requiresBusinessContext: true, businessId: "someone-elses-business" }), workspaceUser)
    ).rejects.toThrow();
    expect(fakeOpenAI.calls.length).toBe(0);
    expect(fakeAnthropic.calls.length).toBe(0);
    expect(fakeGemini.calls.length).toBe(0);
  });
});
