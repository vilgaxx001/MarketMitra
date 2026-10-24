import { describe, it, expect } from "vitest";
import { routeRequest } from "@/modules/ai/core/routing/router";
import { AICoreError } from "@/modules/ai/core/types/errors";
import type { AITaskRequirements } from "@/modules/ai/core/types/routing";

function base(overrides: Partial<AITaskRequirements> = {}): AITaskRequirements {
  return { requiredCapabilities: ["TEXT_GENERATION"], strategy: "BALANCED", ...overrides };
}

describe("AI Router", () => {
  it("selects a model satisfying required capabilities", () => {
    const r = routeRequest(base());
    expect(r.selectedProvider).toBeTruthy();
    expect(r.selectedModelId).toBeTruthy();
    expect(r.candidateCount).toBeGreaterThan(0);
  });
  it("is deterministic", () => {
    const req = base({ strategy: "QUALITY" });
    const results = Array.from({ length: 5 }, () => routeRequest(req));
    const first = results[0]!;
    for (const r of results) { expect(r.selectedProvider).toBe(first.selectedProvider); expect(r.selectedModelId).toBe(first.selectedModelId); }
  });
  it("throws NO_COMPATIBLE_MODEL when nothing satisfies requirements", () => {
    expect(() => routeRequest(base({ requiredCapabilities: ["TEXT_GENERATION", "EMBEDDINGS"] }))).toThrow(AICoreError);
  });
  it("NO_COMPATIBLE_MODEL has fromProvider:false", () => {
    try {
      routeRequest(base({ requiredCapabilities: ["EMBEDDINGS"] }));
      expect.fail("expected throw");
    } catch (err) {
      expect((err as AICoreError).code).toBe("NO_COMPATIBLE_MODEL");
      expect((err as AICoreError).details.fromProvider).toBe(false);
    }
  });
  it("enforces minContextTokens", () => { expect(() => routeRequest(base({ minContextTokens: 100_000_000 }))).toThrow(AICoreError); });

  describe("strategies", () => {
    it("QUALITY", () => { expect(routeRequest(base({ strategy: "QUALITY", requiredCapabilities: ["TEXT_GENERATION", "VISION"] })).strategy).toBe("QUALITY"); });
    it("BALANCED", () => { expect(routeRequest(base({ strategy: "BALANCED" })).strategy).toBe("BALANCED"); });
    it("FAST prefers FAST-tier model", () => {
      const r = routeRequest(base({ strategy: "FAST" }));
      expect(["gpt-4o-mini", "fixture-anthropic-fast", "fixture-gemini-fast"]).toContain(r.selectedModelId);
    });
    it("COST_EFFICIENT prefers LOW-tier model", () => {
      const r = routeRequest(base({ strategy: "COST_EFFICIENT" }));
      expect(["gpt-4o-mini", "fixture-anthropic-fast", "fixture-gemini-fast"]).toContain(r.selectedModelId);
    });
  });

  describe("preferences", () => {
    it("honors valid preferredModelId", () => {
      const r = routeRequest(base({ preferredModelId: "gpt-4o-mini", preferredProvider: "openai" }));
      expect(r.selectedModelId).toBe("gpt-4o-mini");
      expect(r.selectionReason).toBe("PREFERRED_MODEL_HONORED");
    });
    it("ignores invalid preferredModelId", () => {
      const r = routeRequest(base({ preferredModelId: "does-not-exist" }));
      expect(r.selectedModelId).not.toBe("does-not-exist");
    });
    it("preference cannot bypass capability filter", () => {
      const r = routeRequest(base({ requiredCapabilities: ["TEXT_GENERATION", "VISION"], preferredModelId: "fixture-anthropic-fast", preferredProvider: "anthropic" }));
      expect(r.selectedModelId).not.toBe("fixture-anthropic-fast");
    });
    it("honors valid preferredProvider", () => {
      const r = routeRequest(base({ preferredProvider: "gemini" }));
      expect(r.selectedProvider).toBe("gemini");
      expect(r.selectionReason).toBe("PREFERRED_PROVIDER_HONORED");
    });
  });

  describe("fallback exclusion", () => {
    it("excludes attempted combos", () => {
      const first = routeRequest(base());
      const excluded = new Set([`${first.selectedProvider}:${first.selectedModelId}`]);
      const second = routeRequest(base(), excluded);
      expect(`${second.selectedProvider}:${second.selectedModelId}`).not.toBe(`${first.selectedProvider}:${first.selectedModelId}`);
    });
    it("throws ALL_CANDIDATES_EXHAUSTED eventually", () => {
      const excluded = new Set<string>();
      let guard = 0;
      while (guard < 20) {
        guard += 1;
        try {
          const r = routeRequest(base(), excluded);
          excluded.add(`${r.selectedProvider}:${r.selectedModelId}`);
        } catch (err) {
          expect((err as AICoreError).code).toBe("ALL_CANDIDATES_EXHAUSTED");
          return;
        }
      }
      expect.fail("expected exhaustion");
    });
  });
});
